import _extend from 'lodash-es/extend';
import _find from 'lodash-es/find';
import _forEach from 'lodash-es/forEach';
import _isEmpty from 'lodash-es/isEmpty';

import rbush from 'rbush';

import { dispatch as d3_dispatch } from 'd3-dispatch';
import { request as d3_request } from 'd3-request';

import { geoExtent, geoVecAdd } from '../geo';

import { krError } from '../osm';

import {
    utilRebind,
    utilTiler,
    utilQsString
} from '../util';


var tiler = utilTiler();
var dispatch = d3_dispatch('authLoading', 'authDone', 'change', 'loading', 'loaded', 'loadedKeepRight');

var _keepRightCache = { loaded: {}, inflight: {}, keepRight: {}, rtree: rbush()};
var _off;
var _keepRightZoom = 16;

var apiBase = 'https://www.keepright.at/';


function abortRequest(i) {
    if (i) {
        i.abort();
    }
}


function abortUnwantedRequests(cache, tiles) {
    _forEach(cache.inflight, function(v, k) {
        var wanted = _find(tiles, function(tile) { return k === tile.id; });
        if (!wanted) {
            abortRequest(v);
            delete cache.inflight[k];
        }
    });
}


function encodeErrorRtree(error) {
    return {
        minX: error.loc[0],
        minY: error.loc[1],
        maxX: error.loc[0],
        maxY: error.loc[1],
        data: error
    };
}


// replace or remove error from rtree
function updateRtree(item, replace) {
    _keepRightCache.rtree.remove(item, function isEql(a, b) { return a.data.id === b.data.id; });

    if (replace) {
        _keepRightCache.rtree.insert(item);
    }
}


export default {
    init: function() {
        if (!_keepRightCache) {
            this.reset();
        }

        this.event = utilRebind(this, dispatch, 'on');
    },

    reset: function() {
        _forEach(_keepRightCache.inflight, abortRequest);

        _keepRightCache = { loaded: {}, inflight: {}, keepRight: {}, rtree: rbush()};
    },

    loadKeepRightErrors: function(context, projection, options, callback) {
        options = _extend({ 'format': 'geojson' }, options);
        if (_off) return;

        var cache = _keepRightCache;

        var that = this;
        var path = apiBase +
            'export.php?' +
            'format=' + options.format +
            '&ch=' + options.ch.join() + '&';

        // determine the needed tiles to cover the view
        var tiles = tiler.zoomExtent([_keepRightZoom, _keepRightZoom]).getTiles(projection);

        // abort inflight requests that are no longer needed
        var hadRequests = !_isEmpty(cache.inflight);
        abortUnwantedRequests(cache, tiles);
        if (hadRequests && _isEmpty(cache.inflight)) {
            dispatch.call('loaded');    // stop the spinner
        }

        // issue new requests..
        tiles.forEach(function(tile) {
            if (cache.loaded[tile.id] || cache.inflight[tile.id]) return;
            if (_isEmpty(cache.inflight)) {
                dispatch.call('loading');   // start the spinner
            }

            var rect = tile.extent.rectangle();
            var nextPath = path +
                utilQsString({
                    left: rect[0],
                    bottom: [3],
                    right: rect[2],
                    top: rect[1]
                });


            var options = {}; // TODO: implement

            cache.inflight[tile.id] = that.loadFromAPI(
                nextPath,
                function(err, data) {
                    if (err || !data.features || !data.features.length) return;

                    cache.loaded[tile.id] = true;
                    delete cache.inflight[tile.id];

                    if (callback) {
                        callback(err, _extend({ data: data }, tile));
                    }
                    if (_isEmpty(cache.inflight)) {
                        dispatch.call('loaded');     // stop the spinner
                    }
                },
                options
            );
        });
    },

    loadFromAPI: function(path, callback, options) {
        var cache = _keepRightCache;

        return d3_request(path)
            .mimeType('application/json') // TODO: only have this as a response if the input format is json
            .header('Content-type', 'application/x-www-form-urlencoded')
            .response(function(xhr) {
                return JSON.parse(xhr.responseText);
            })
            .get(function(err, data) {

                var features = data.features.map(function(feature) {
                    var loc = feature.geometry.coordinates;
                    var props = feature.properties;

                    // TODO: finish implementing overlapping error offset
                    // // if errors are coincident, move them apart slightly
                    // var coincident = false;
                    // var epsilon = 0.00001;
                    // do {
                    //     if (coincident) {
                    //         loc = geoVecAdd(loc, [epsilon, epsilon]);
                    //     }
                    //     var bbox = geoExtent(loc).bbox();
                    //     coincident = cache.rtree.search(bbox).length;
                    // } while (coincident);

                    var d = new krError ({
                        loc: loc,
                        id: props.error_id,
                        comment: props.comment || null,
                        description: props.description || '',
                        error_id: props.error_id,
                        error_type: props.error_type,
                        object_id: props.object_id,
                        object_type: props.object_type,
                        schema: props.schema,
                        title: props.title
                    });

                    cache.keepRight[d.id] = d;

                    return {
                        minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d
                    };

                }).filter(Boolean);

                cache.rtree.load(features);
                dispatch.call('loadedKeepRight');

                callback(err, data);
            });
    },

    postKeepRightUpdate: function(d, callback) {
        // TODO: check if a user is authenticated
        // if (!this.authenticated()) {
        //     return callback({ message: 'Not Authenticated', status: -3 }, d);
        // }
        // if (_keepRightCache.inflightPost[d.id]) {
        //     return callback({ message: 'Error update already inflight', status: -2 }, d);
        // }

        var path = apiBase + 'comment.php?';
        if (d.state) { path += '&st=' + d.state; }
        if (d.newComment) { path += '&' + utilQsString({'co': d.newComment }); }

        path += '&schema=' + d.schema + '&id=' + d.error_id;

        d3_request(path)
            .mimeType('application/json')
            .response(function(xhr) {
                return JSON.parse(xhr.responseText);
            })
            .post(function(err, data) {
                console.log('error:', err);
                console.log('data: ', data);
            });
    },

    // get all cached errors covering the viewport
    keepRight: function(projection) {
        var viewport = projection.clipExtent();
        var min = [viewport[0][0], viewport[1][1]];
        var max = [viewport[1][0], viewport[0][1]];
        var bbox = geoExtent(projection.invert(min), projection.invert(max)).bbox();

        return _keepRightCache.rtree.search(bbox)
            .map(function(d) { return d.data; });
    },

    // get a single error from the cache
    getError: function(id) {
        return _keepRightCache.keepRight[id];
    },

    // replace a single error in the cache
    replaceError: function(error) {
        if (!(error instanceof krError) || !error.id) return;

        _keepRightCache.keepRight[error.id] = error;
        updateRtree(encodeErrorRtree(error), true);  // true = replace
        return error;
    },

    // remove a single error from the cache
    removeError: function(error) {
        if (!(error instanceof krError) || !error.id) return;

        delete _keepRightCache.keepRight[error.id];
        updateRtree(encodeErrorRtree(error), false);  // false = remove
    },
};