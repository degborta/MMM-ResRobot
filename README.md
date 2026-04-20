# MMM-ResRobot

A module for MagicMirror2 (https://github.com/MichMich/MagicMirror) which shows scheduled departures from public transport stop(s) in Sweden. The module
uses the ResRobot API for which you do need to obtain an API key, see below.

# Install

1. Clone repository into `../modules/` inside your MagicMirror folder.
2. Run `npm install` inside `../modules/MMM-ResRobot/` folder
3. Find your Station ID using the ResRobot location API: `https://api.resrobot.se/v2.1/location.name?input=YOUR+STATION+NAME&format=json&accessId=YOUR_API_KEY`
4. Add the module to the MagicMirror config
```
	{
		module: "MMM-ResRobot",
		position: "left",
		header: "Departures",
		config: {
			routes: [
				{from: "", to: ""},		// ResRobot Station IDs of starting and destination station(s). At least one route must be defined.
				{from: "", to: ""},		// "from" is required, "to" is optional (set to empty string for all destinations)
				{from: "", to: "", label: "Gävle"},	// Optional "label" overrides the displayed destination name
			],
			skipMinutes: 0,		// Skip departures within the next <value> minutes
			maximumEntries: 6,	// Number of departures to show on screen
			maximumDuration: 360,	// Number of minutes to search for departures
			getRelative: 0,		// Show relative time when less than <value> minutes to departure, 0 = always show absolute time
			truncateAfter: 5,	// Truncate direction name at first space after <value> characters. 0 = no truncation
			truncateLineAfter: 5,	// Truncate line number after <value> characters. 0 = no truncation
			showTrack: true,	// If true, track number will be displayed
			showTransportTypes: [],	// Limit to specific transport types e.g. ["B"] for bus only, ["B","J"] for bus and train. Empty = show all.
			coloredIcons: false,	// Color transportation type icons according to colorTable
			apiKey: ""		// Your ResRobot API key
        }
    },
```
# Get API key

You need to obtain your API key at http://www.trafiklab.se — look for the API "ResRobot v2.1". If you have a key for v2.0 you need to get a new one. Registration is free but required.

# Transport type codes

Use these codes with `showTransportTypes` to filter what is displayed:

| Code | Type |
|------|------|
| `B`  | Bus |
| `J`  | Train |
| `S`  | Subway |
| `U`  | Metro |
| `F`  | Ferry |

# Multiple instances

You can add the module more than once in your MagicMirror config to show different routes on separate panels. Each instance reads only its own config — just make sure each has its own `routes` and optionally its own `showTransportTypes`.
