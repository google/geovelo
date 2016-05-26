/**
 * @fileoverview Custom Texture that holds beacon vertex data for the line
 * vertex shader.
 *
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// Texture requires THREE.js.
if (typeof THREE === 'undefined') {
  throw Error('THREE.js is required by BeaconVertexTexture.');
}

var geovelo;
geovelo = geovelo || {};

/**
 * Custom texture to hold beacon vertex data. Each pixel of the underlying image
 * holds two longitude/latitude pairs, pre-converted to Web Mercator
 * coordinates. This is accomplished by using floating point image data which
 * gives us 32-bit floats per channel instead of the typical 8-bit integer.
 *
 * The Red and Green channels for a pixel hold one lon/lat pair, respectively,
 * and the Blue and Alpha channels hold another.
 *
 *     +---------+
 *     | RG :    |  R/G = Lon/Lat
 *     |    :    |
 *     |    : BA |  B/A = Lon/Lat
 *     +---------+
 *
 * The first half of the first column (index 0) of pixels is special, because it
 * contains the (b)ase longitude and latitude for the beacon (its first reading)
 * in its RG slots.
 *
 * Starting with the second column (index 1), each RG and BA pair holds the
 * cumulative offset relative to the base. So for example, if the beacon didn't
 * move at all from the initial day to the second, then the RG channels of the
 * second column would be 0/0.
 *
 *      |       | |       | |       |
 *      +-------+ +-------+ +-------+             b = base
 *      +-------+ +-------+ +-------+ +         med = medians
 *      | b :   | | 1 :   | | 3 :   | |           N = number of timesteps
 *   1  |   :   | |   :   | |   :   | |  ...
 *      |   : 0 | |   : 2 | |   : 4 | |
 *      +-------+ +-------+ +-------+ +--- ---+
 *      +-------+ +-------+ +-------+ +--- ---+ +-------+
 *      | b :   | | 1 :   | | 3 :   | |       | |N-1:   |
 *   0  |   :   | |   :   | |   :   | |  ...  | |   :   |
 *      |   : 0 | |   : 2 | |   : 4 | |       | |   : N |
 *      +-------+ +-------+ +-------+ +--- ---+ +-------+
 *      +-------+ +-------+ +-------+ +--- ---+ +-------+
 *      |   :   | | 1 :   | | 3 :   | |       | |N-1:   |
 *  med |   :   | |   :   | |   :   | |  ...  | |   :   |
 *      |   : 0 | |   : 2 | |   : 4 | |       | |   : N |
 *      +-------+ +-------+ +-------+ +--- ---+ +-------+
 *    px    0         1         2                width-1
 *
 * The LineShaderMaterial is responsible for using a given vertex's timestamp
 * and beaconIndex to look up its lon/lat pair from this texture at render time.
 *
 * If more data is needed per beacon/timestatmp in the future, and that data is
 * needed by more than one vertex, then this would be the place to add it. For
 * example, rather than packing two lon/lat pairs into a pixel, you could pack
 * just one in RG, then use the BA slots for other information (like the
 * magnitude of the movement). But do so carefully, since this would require
 * likewise changes in the LineShaderMaterial.
 *
 * If additional information is needed per vertex, and that information is NOT
 * needed at render time by other vertices, then it would be better to add that
 * data to an attribute on the Line's BufferGeometry (see geovelo.Overlay).
 *
 * @param {number} beaconCount Number of beacons represented.
 * @param {number} startTimestamp The earliest Unix timestamp of any data point.
 * @param {number} endTimestamp The latest Unix timestamp of any data point.
 */
geovelo.BeaconVertexTexture =
    function(beaconCount, startTimestamp, endTimestamp) {

  THREE.Texture.call(this, null);

  this.beaconCount = beaconCount;
  this.startTimestamp = startTimestamp;
  this.endTimestamp = endTimestamp;
  this.timestampCount = (endTimestamp - startTimestamp) / 60 / 60 / 24 + 1;

  // Each column represents two timestamps, plus a slot for for base positions.
  this.width = Math.ceil((this.timestampCount + 1) / 2)

  // One row per beacon, plus one for storing the medians.
  this.height = beaconCount + 1;

  this.data = new Float32Array(this.width * this.height * 4);
  this.image = {
    data: this.data,
    width: this.width,
    height: this.height
  };

  this.format = THREE.RGBAFormat;
  this.type = THREE.FloatType;

  this.magFilter = THREE.NearestFilter;
  this.minFilter = THREE.NearestFilter;

  this.flipY = false;
  this.generateMipmaps  = false;
};
geovelo.BeaconVertexTexture.prototype =
  Object.create(THREE.DataTexture.prototype);
geovelo.BeaconVertexTexture.prototype.constructor = geovelo.BeaconVertexTexture;

/**
 * Given a beacon index and time index, compute the offset into the data array
 * where the longitude would be found (latitude will be one greater). This
 * method does no bounds checking, and so it can be used to find the offset for
 * the special beacon base column and the special medians row.
 *
 * @param {number} beaconIndex Index of the beacon, or -1 for the beacon's base.
 * @param {number} timeIndex Index of timestamp or -1 for the median row.
 */
geovelo.BeaconVertexTexture.prototype.computeOffset =
    function(beaconIndex, timeIndex) {
  return (beaconIndex + 1) * this.width * 4 + (timeIndex + 1) * 2;
};

/**
 * Given a timestamp, return the number of days since the start timestamp.
 *
 * @param {number} timestamp Timestamp to convert.
 */
geovelo.BeaconVertexTexture.prototype.getTimeIndex = function(timestamp) {
  return (timestamp - this.startTimestamp) / 60 / 60 / 24;
}

/**
 * Set the longitude and latitude values for a particular beacon at a particular
 * timestamp.
 *
 * @param {number} beaconIndex Index of the beacon.
 * @param {number} timestamp Timestamp to set.
 * @param {number} lon The longitude diff in Web Mercator projected coordinates.
 * @param {number} lat The latitude diff in Web Mercator projected coordinates.
 */
geovelo.BeaconVertexTexture.prototype.setBeaconLonLat =
    function(beaconIndex, timestamp, lon, lat) {
  if (beaconIndex >= this.beaconCount) {
    throw Error('Beacon index out of bounds.');
  }
  if (timestamp < this.startTimestamp || timestamp > this.endTimestamp) {
    throw Error('Timestamp out of bounds.');
  }
  var offset = this.computeOffset(beaconIndex, this.getTimeIndex(timestamp));
  this.data[offset + 0] = lon;
  this.data[offset + 1] = lat;
  this.needsUpdate = true;
};

/**
 * Set the cumulative median difference lon/lat for a particular timestamp.
 *
 * @param {number} timestamp Timestamp to set.
 * @param {number} lon The longitude diff in Web Mercator projected coordinates.
 * @param {number} lat The latitude diff in Web Mercator projected coordinates.
 */
geovelo.BeaconVertexTexture.prototype.setMedianLonLat =
    function(timestamp, lon, lat) {
  if (timestamp < this.startTimestamp || timestamp > this.endTimestamp) {
    throw Error('Timestamp out of bounds.');
  }
  var offset = this.computeOffset(-1, this.getTimeIndex(timestamp));
  this.data[offset + 0] = lon;
  this.data[offset + 1] = lat;
  this.needsUpdate = true;
};

/**
 * Set the cumulative median difference lon/lat for a particular timestamp.
 *
 * @param {number} beaconIndex Index of the beacon.
 * @param {number} lon The longitude diff in Web Mercator projected coordinates.
 * @param {number} lat The latitude diff in Web Mercator projected coordinates.
 */
geovelo.BeaconVertexTexture.prototype.setBaseLonLat =
    function(beaconIndex, lon, lat) {
  if (beaconIndex >= this.beaconCount) {
    throw Error('Beacon index out of bounds.');
  }
  var offset = this.computeOffset(beaconIndex, -1);
  this.data[offset + 0] = lon;
  this.data[offset + 1] = lat;
  this.needsUpdate = true;
};
