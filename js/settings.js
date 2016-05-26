/**
 * @fileoverview Settings for the Geodetic Velocities visualization.
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

/**
 * Settings for the Geodetic Velocities visualization. Each property in this
 * hash represents one configurable area of the visualization.
 *
 * Within each area, the 'options' hash includes individual settings that should
 * appear at position in the UI.
 *
 * Conventions used throughout:
 *  - displayName - Optional string to display for this folder or option.
 *  - description - Opitonal string describing this folder or option.
 *  - defaultValue - The starting value to use for this setting.
 *  - min, max - The smallest and largest allowed values.
 */
geovelo.settings = {

  data: {
    displayName: 'Data',
    description: 'Settings for loading and manipulating the data.',
    open: true,
    options: {
      multiplier: {
        description:
            'Power of 10 by which to multiply latitudinal and longitudinal ' +
            'movements. Increasing this number further exaggerates geodetic ' +
            'velocities.',
        defaultValue: 5.5,
        min: 1,
        max: 8,
        step: 0.01
      },
      medianCorrection: {
        displayName: 'median correction',
        description:
            'How much of the cumulative median movement to subtract out.',
        defaultValue: 1,
        min: 0,
        max: 1
      }
    }
  }

};
