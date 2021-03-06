import {
    event as d3_event,
    select as d3_select
} from 'd3-selection';

import { t } from '../util/locale';
import { svgIcon } from '../svg';

export function uiPresetFavorite(preset, geom, context) {

    var presetFavorite = {};

    var _button = d3_select(null);


    presetFavorite.button = function(selection) {

        var canFavorite = geom !== 'vertex' && geom !== 'relation' && !preset.isFallback();

        _button = selection.selectAll('.preset-favorite-button')
            .data(canFavorite ? [0] : []);

        _button.exit().remove();

        _button = _button.enter()
            .insert('button', '.tag-reference-button')
            .attr('class', 'preset-favorite-button')
            .attr('title', t('icons.favorite'))
            .attr('tabindex', -1)
            .call(svgIcon('#iD-icon-favorite'))
            .merge(_button);

        _button
            .classed('active', function() {
                return context.isFavoritePreset(preset, geom);
            })
            .on('click', function () {
                d3_event.stopPropagation();
                d3_event.preventDefault();

                //update state of favorite icon
                d3_select(this)
                    .classed('active', function() {
                        return !d3_select(this).classed('active');
                    });

               context.favoritePreset(preset, geom);

            });

    };

    return presetFavorite;
}
