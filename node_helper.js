/* Resrobot - Timetable for ResRobot Module */

/* Magic Mirror
 * Module: MMM-ResRobot
 *
 * By Johan Alvinger https://github.com/Alvinger
 * based on a script by Benjamin Angst http://www.beny.ch which is
 * based on a script from Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 */
const Log = require("../../js/logger.js");
const NodeHelper = require("node_helper");
const moment = require("moment");
module.exports = NodeHelper.create({

	// Define start sequence.
	start: function() {
		Log.info("Starting node_helper for module: " + this.name);
		moment.locale(config.language);
		this.instances = {};
	},

	// Receive notification
	socketNotificationReceived: function(notification, payload) {
   		Log.info("node_helper for " + this.name + " received a socket notification: " + notification + " - Payload: " + JSON.stringify(payload, null, 2));
		if (notification === "CONFIG") {
			var id = payload.identifier;
			this.instances[id] = { config: payload.config, departures: [] };
			this.updateDepartures(id);
		}
	},

	/* updateDepartures(identifier)
	 * Check current departures and remove old ones. Requests new departure data if needed.
	 */
	updateDepartures: function(identifier) {
		var self = this;
		var instance = this.instances[identifier];
		var now = moment();
		var cutoff = now.clone().add(moment.duration(instance.config.skipMinutes, "minutes"));

		// Sort current departures by routeId and departure time (descending)
		instance.departures.sort(function(a, b) {
			if (a.routeId < b.routeId) return -1;
			if (a.routeId > b.routeId) return 1;
			if (a.timestamp < b.timestamp) return 1;
			if (a.timestamp > b.timestamp) return -1;
			return 0;
 		});

		// Loop through current departures (by route) and skip old ones
		var routeId = "";
		var departures = [];
		for (var d in instance.departures) {
			var dep = instance.departures[d];
			if (dep.routeId !== routeId) {
				routeId = dep.routeId;
				departures[routeId] = [];
			}
			var departureTime = moment(dep.timestamp);
			if (departureTime.isAfter(cutoff)) {
				departures[routeId].push(dep);
			} else {
				departures[routeId] = [];
			}
		}

		instance.departures = [];
		var getRoutes = [];
		for (var routeId in instance.config.routes) {
			if (typeof departures[routeId] == 'undefined' || departures[routeId].length == 0) {
				var params = { "id": instance.config.routes[routeId].from };
				if (typeof instance.config.routes[routeId].to == "string" && instance.config.routes[routeId].to !== "") {
					params["direction"] = instance.config.routes[routeId].to;
				}
				var url = this.createURL(identifier, params);
				getRoutes.push({"routeId": routeId, "url": url});
			} else {
				for (d in departures[routeId]) {
					departures[routeId][d].waitingTime = moment(departures[routeId][d].timestamp).diff(now, "minutes");
					Log.debug("WaitingTime: " + departures[routeId][d].waitingTime);
					instance.departures.push(departures[routeId][d]);
				}
			}
		}
		if (getRoutes.length == 0) {
			this.sendDepartures(identifier);
		} else {
			var getRouteDepartures = getRoutes.map( (r) => {
				return (async () => {
					const maskedUrl = r.url.replace(/(accessId=)[^&]+/, "$1***");
					Log.info("MMM-ResRobot: Fetching departures for route " + r.routeId + " from URL: " + maskedUrl);
					const response = await fetch(r.url);
					if (!response.ok) {
						Log.error("MMM-ResRobot: API error " + response.status + " for route " + r.routeId);
						return;
					}
					const json = await response.json();
					json.routeId = r.routeId;
					self.saveDepartures(identifier, json);
					return json;
				})();
			})

			Promise.all(getRouteDepartures)
			.then( () => {
				self.sendDepartures(identifier);
			});
		}
	},

	/* saveDepartures(identifier, data)
	 * Uses the received data to set the various values.
	 */
	saveDepartures: function(identifier, data) {
		var instance = this.instances[identifier];
		var now = moment();
		var routeId = data.routeId;
		if (!data.Departure || data.Departure.length === 0) {
			Log.warn("MMM-ResRobot: No departures in API response for route " + routeId + ". Response keys: " + Object.keys(data).join(", "));
			return;
		}
		for (var i in data.Departure) {
			var departure = data.Departure[i];
			var departureTime = moment(departure.date + "T" + departure.time);
			var waitingTime = departureTime.diff(now, "minutes");
			var departureTransportNumber = departure.ProductAtStop.num;
			var departureTo = instance.config.routes[routeId].label || departure.direction;
			var departureType = departure.ProductAtStop.catOutS;
			if (!instance.config.routes[routeId].label && instance.config.truncateAfter > 0) {
				if (departureTo.indexOf(" ", instance.config.truncateAfter) > 0) {
					departureTo = departureTo.substring(0, departureTo.indexOf(" ", instance.config.truncateAfter));
				}
			}
			if (instance.config.truncateLineAfter > 0) {
				departureTransportNumber = departureTransportNumber.substring(0, instance.config.truncateLineAfter);
			}
			var allowedTypes = instance.config.showTransportTypes;
			if (allowedTypes.length > 0 && !allowedTypes.includes(departureType.charAt(0))) {
				continue;
			}
			if (departureTime.isSameOrAfter(now.clone().add(moment.duration(instance.config.skipMinutes, 'minutes')))) {
				instance.departures.push({
					routeId: routeId,
					timestamp: departureTime,
					departureTime: departureTime.format("HH:mm"),
					waitingTime: waitingTime,
					line: departureTransportNumber,
					track: departure.rtTrack,
					type: departureType,
					to: departureTo
				});
			}
		}
	},
	/* sendDepartures(identifier)
	 * Output departures notification and schedule next update.
	 */
	sendDepartures: function(identifier) {
		var instance = this.instances[identifier];
		if (instance.departures.length > 0) {
			instance.departures.sort(function(a, b) {
				if (a.timestamp < b.timestamp) return -1;
				if (a.timestamp > b.timestamp) return 1;
				return 0;
 			});
		}
		this.sendSocketNotification("DEPARTURES", { identifier: identifier, departures: instance.departures });
		this.scheduleUpdate(identifier);
	},

	/* createURL(identifier, params)
	 * Generates a base url with api parameters based on the config.
	 */
	createURL: function(identifier, params) {
		var cfg = this.instances[identifier].config;
		var url = cfg.apiBase;
		url += "&accessId=" + encodeURIComponent(cfg.apiKey);
		if (cfg.maximumDuration !== "") {
			url += "&duration=" + encodeURIComponent(Math.min(cfg.maximumDuration, 1439));
		}
		if (cfg.maximumEntries !== "") {
			url += "&maxJourneys=" + encodeURIComponent(cfg.maximumEntries);
		}
		for (var key in params) {
			url += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
		}
		return url;
	},

	/* scheduleUpdate(identifier, delay)
	 * Schedule next update.
	 */
	scheduleUpdate: function(identifier, delay) {
		var self = this;
		var instance = this.instances[identifier];
		var nextLoad = instance.config.updateInterval;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}

		clearTimeout(instance.updateTimer);
		instance.updateTimer = setTimeout(function() {
			self.updateDepartures(identifier);
		}, nextLoad);
	}
});
