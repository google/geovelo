/**
 * @fileoverview Google Maps, like many online mapping platforms, uses the Web
 * Mercator projection. The WebMercator object defined here houses convenience
 * methods for converting between geodetic longitude/latitude and projected
 * coordinates.
 * See https://en.wikipedia.org/wiki/Web_Mercator
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

var geovelo;
geovelo = geovelo || {};

(function() {

// Computational constants.
var DEG_TO_RAD = Math.PI / 180;
var ZOOM_FACTOR = 128 / Math.PI;
var PI_OVER_FOUR = Math.PI / 4;

geovelo.WebMercator = {

  /**
   * Given a longitude in degrees, return its Web Mercator x pixel value.
   */
  getX: function(lon) {
    return ZOOM_FACTOR * (lon * DEG_TO_RAD + Math.PI);
  },

  /**
   * Given a latitude in degrees, return its Web Mercator y pixel value.
   */
  getY: function(lat) {
    return ZOOM_FACTOR * (
      Math.PI - Math.log(Math.tan(PI_OVER_FOUR - lat * DEG_TO_RAD / 2)));
  }

};

})();
