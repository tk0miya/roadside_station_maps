var React = require('react');
var RoadStation = require('./roadstation');

var Station = React.createClass({
    propTypes: {
        feature: React.PropTypes.object,
        onStationSelected: React.PropTypes.func
    },
    onClick: function() {
        this.props.onStationSelected(this.props.feature);
    },
    render: function() {
        var station = new RoadStation(this.props.feature);
        var icon = station.getStyle()['icon'];

        return (
            <div className="station clearfix">
                <div className="icon"><img src={icon} /></div>
                <div className="name"><a href="javascript:void(0);" onClick={this.onClick}>{station.name}</a></div>
                <div className="address">{station.address}</div>
            </div>
        );
    }
});

var StationList = React.createClass({
    propTypes: {
        zoom: React.PropTypes.number,
        stations: React.PropTypes.array,
        onStationSelected: React.PropTypes.func
    },
    render: function() {
        if (this.props.stations.length == 0) {
            var stations = "表示している範囲に道の駅はありません。";
        } else {
            var stations = this.props.stations.map((feature) => {
                return <Station key={feature.getProperty("station_id")} feature={feature}
                                onStationSelected={this.props.onStationSelected} />
            });
        }
        return <div id="stations">{stations}</div>;
    }
});

module.exports = StationList;
