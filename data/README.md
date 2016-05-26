The Geodetic Velocities Visualization expects to find a data file in this
directory called `beacon-data.json` which must be provided.

This JSON file should contain an array of objects, each describing a GPS beacon,
including its latitude and longitude position over time.

Example:

```js
[
  {
    "name": "000841",
    "start": 985928400,
    "lon": [139.06990407, 139.069904, 139.06990413, ...],
    "lat": [34.949757897, 34.949757882, 34.949757941, ...]
  },{
    "name": "000842",
    "start": 982818000,
    "lon": [...],
    "lat": [...]
  },{
  ...

  {
    "name": "99R004",
    "start": 1364875200,
    "lon": [...],
    "lat": [...]
  },{
    "name": "99R006",
    "start": 1364875200,
    "lon": [...],
    "lat": [...]
  }
]
```

For each entry in the array, here are the types and meanings of the fields:

* `name` - string - The name of the beacon (should be unique).
* `start` - integer - Unix timestamp of the first GPS reading.
* `lon` - Array of floats - Longitudinal readings at 1 day increments.
* `lat` - Array of floats - Latitude readings for each day.

The lon and lat arrays must be the same length for each beacon, but they may
be different between beacons.

The special value of `0` in the lon/lat arrays is treated as missing data.
