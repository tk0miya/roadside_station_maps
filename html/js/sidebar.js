var React = require('react');
var $ = require('jquery');

var StationList = require('./stationlist');

var Sidebar = React.createClass({
    propTypes: {
        onStationSelected: React.PropTypes.func
    },
    getInitialState: function() {
        return { status: "closed", zoom: -1, stations: [] };
    },
    onSidebarClosed: function() {
        if ($("#sidebar").offset().left == 0) {
            var width = - $("#stations").width();
            this.setState({ status: "closed" });
        } else {
            var width = 0;
            this.setState({ status: "opened" });
        }

        $("#sidebar").animate({ left: width }, { duration: 300, queue: null });
    },
    render: function() {
        return (
            <div id="sidebar">
                <StationList ref="stationlist" zoom={this.state.zoom} stations={this.state.stations}
                             onStationSelected={this.props.onStationSelected} />
                <div id="tab-openr">
                    <button id="openr-button" className={this.state.status} onClick={this.onSidebarClosed} />
                </div>
            </div>
        );
    }
});

module.exports = Sidebar;
