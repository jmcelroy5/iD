describe('iD.validations.tag_suggests_area', function () {
    var context;

    beforeEach(function() {
        context = iD.Context();
    });

    function createPoint(tags) {
        var n1 = iD.osmNode({id: 'n-1', loc: [4,4], tags: tags});
        context.perform(
            iD.actionAddEntity(n1)
        );
    }

    function createOpenWay(tags) {
        var n1 = iD.osmNode({id: 'n-1', loc: [4,4]});
        var n2 = iD.osmNode({id: 'n-2', loc: [4,5]});
        var n3 = iD.osmNode({id: 'n-3', loc: [5,5]});
        var w = iD.osmWay({id: 'w-1', nodes: ['n-1', 'n-2', 'n-3'], tags: tags});

        context.perform(
            iD.actionAddEntity(n1),
            iD.actionAddEntity(n2),
            iD.actionAddEntity(n3),
            iD.actionAddEntity(w)
        );
    }

    function createClosedWay(tags) {
        var n1 = iD.osmNode({id: 'n-1', loc: [4,4]});
        var n2 = iD.osmNode({id: 'n-2', loc: [4,5]});
        var n3 = iD.osmNode({id: 'n-3', loc: [5,5]});
        var w = iD.osmWay({id: 'w-1', nodes: ['n-1', 'n-2', 'n-3', 'n-1'], tags: tags});

        context.perform(
            iD.actionAddEntity(n1),
            iD.actionAddEntity(n2),
            iD.actionAddEntity(n3),
            iD.actionAddEntity(w)
        );
    }

    function validate() {
        var validator = iD.validationTagSuggestsArea();
        var changes = context.history().changes();
        var entities = changes.modified.concat(changes.created);
        var issues = [];
        entities.forEach(function(entity) {
            issues = issues.concat(validator(entity, context));
        });
        return issues;
    }


    it('has no errors on init', function() {
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores points', function() {
        createPoint({ building: 'yes' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores open way without area tag', function() {
        createOpenWay({});
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores closed way with area tag', function() {
        createClosedWay({ building: 'yes' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('ignores open way with tag that allows both lines and areas', function() {
        createOpenWay({ man_made: 'yes' });
        var issues = validate();
        expect(issues).to.have.lengthOf(0);
    });

    it('flags open way with area tag', function() {
        createOpenWay({ building: 'yes' });
        var issues = validate();
        expect(issues).to.have.lengthOf(1);
        var issue = issues[0];
        expect(issue.type).to.eql('tag_suggests_area');
        expect(issue.severity).to.eql('warning');
        expect(issue.entities).to.have.lengthOf(1);
        expect(issue.entities[0].id).to.eql('w-1');
    });

    it('flags open way with both area and line tags', function() {
        createOpenWay({ area: 'yes', barrier: 'fence' });
        var issues = validate();
        expect(issues).to.have.lengthOf(1);
        var issue = issues[0];
        expect(issue.type).to.eql('tag_suggests_area');
        expect(issue.severity).to.eql('warning');
        expect(issue.entities).to.have.lengthOf(1);
        expect(issue.entities[0].id).to.eql('w-1');
    });

});
