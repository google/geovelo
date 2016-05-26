/**
 * @fileoverview Data manipulation utility functions.
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
geovelo.data = {

  /**
   * Given an array, treat falsey values as missing data and replace them
   * in-line by linearly interpolating between the previous and next valid
   * values. E.g. the array [1,0,3] becomes [1,2,3]
   *
   * @param {!Array} arry An array of numbers and possibly other falsey values.
   * @return {!Array} The same array that was passed in.
   */
  interpolateGaps: function(arry) {
    var len = arry.length;
    var i = 0;

    // Scan forward looking for the first non-missing (truthy) value.
    while (i < len - 1 && !arry[i]) {
      i++;
    }

    // We can only hope to interpolate if there are at least two more elements
    // in the array from where we are now.
    while (i < len - 2) {

      // Scan forward looking for a gap (falsey value).
      while (i < len && arry[i]) {
        i++;
      }

      // Short-circuit if there aren't enough elements left to interpolate.
      if (i >= len - 1) {
        return arry;
      }

      // At this point, i points to a missing value, so our left inde should be
      // one less.
      var x1 = i - 1;

      // Next, scan forward looking for an end to the gap.
      i++;
      while (i < len && !arry[i]) {
        i++;
      }

      // Short-circuit if we fell off the array.
      if (i > len - 1 || !arry[i]) {
        return arry;
      }

      // Fill in the missing values with interpolated ones.
      var x2 = i;
      var y1 = arry[x1];
      var y2 = arry[x2];
      var m = (y2 - y1) / (x2 - x1);
      for (var j = x1 + 1; j < x2; j++) {
        arry[j] = y1 + m * (j - x1);
      }

      // Continue where we left off.
    }

    return arry;
  },

  /**
   * A beacon object has a 'lat' and a 'lon' property, both point to arrays of
   * numbers. Given an array of beacon objects, use interpolateGaps to fill in
   * any missing latitude and longitude values.
   *
   * @param {!Array} beacons An array of beacon data objects.
   * @return {!Array} The same array that was passed in.
   */
  fillBeaconGaps: function(beacons) {
    for (var i = 0, ii = beacons.length; i < ii; i++) {
      geovelo.data.interpolateGaps(beacons[i].lat);
      geovelo.data.interpolateGaps(beacons[i].lon);
    }
  }


};
