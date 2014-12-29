"use strict";

// Perseus module uses React directly and uses $._ directly for
// localization, so we do this as a hack to get it to work
function perseusPrep($, React, katex, KAS) {
    window.React = React;
    $._ = function(x) { return x; };
    window.katex = katex
    window.KAS = KAS;
}

define(["jquery", "react", "util", "models", "apiclient", "storage", "katex", "kas"],
        function($, React, Util, models, APIClient, Storage, katex, KAS) {
    var cx = React.addons.classSet;

    /**
     * Represents a single exercise, it will load the exercise dynamically and
     * display it to the user.
     */
    var ExerciseViewer = React.createClass({
        propTypes: {
            exercise: React.PropTypes.object.isRequired
        },
        mixins: [Util.BackboneMixin],
        getBackboneModels: function() {
            return [this.props.exercise];
        },
        getInitialState: function() {
            return { };
        },
        refreshRandomAssessment: function() {
            var count = this.exercise.all_assessment_items.length;
            var randomIndex = Math.floor(Math.random() * count);
            var randomAssessmentId = this.exercise.all_assessment_items[randomIndex].id;
            APIClient.getAssessmentItem(randomAssessmentId).done((result) => {
                Util.log("got assessment item: %o: item data: %o", result, JSON.parse(result.item_data));
                this.setState({
                    perseusItemData: JSON.parse(result.item_data)
                });
            });
        },
        componentWillMount: function() {
            if (this.props.exercise.isPerseusExercise()) {
                APIClient.getExerciseByName(this.props.exercise.getName()).done((result) => {
                    this.exercise = result;
                    Util.log("got exercise: %o", result);
                    this.refreshRandomAssessment();
                });
            }

            perseusPrep($, React, katex, KAS);
            require(["perseus"], (perseus) => {
                this.Renderer = perseus.Renderer;
                this.forceUpdate();
            });
        },
        componentDidMount: function() {
        },
        componentWillUnmount: function() {
        },
        render: function() {
            if (this.state.error) {
                return <div>Could not load exercise</div>;
            } else if (this.props.exercise.isKhanExercisesExercise()) {
                var path = `/khan-exercises/exercises/${this.props.exercise.getFilename()}`;
                return <iframe src={path}/>;
            } else if(this.Renderer && this.state.perseusItemData) {
                return <this.Renderer content={this.state.perseusItemData.question.content}
                                 ignoreMissingWidgets={true}/>
            }
            Util.log("render exercise: :%o", this.props.exercise);
            return <div>TODO: Render exercise :)</div>;
        }
    });

    return {
        ExerciseViewer,
    };
});
