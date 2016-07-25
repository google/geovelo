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
 *  - type - Number (default) or color picker.
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
        step: 0.01,
      },
      medianCorrection: {
        displayName: 'median correction',
        description:
            'How much of the cumulative median movement to subtract out.',
        defaultValue: 1,
        min: 0,
        max: 1,
      },
      showMarkers: {
        displayName: 'show markers',
        description: 'Whether to show a Google Maps marker for each beacon.',
        defaultValue: false,
      },
    },
  },

  style: {
    displayName: 'Style',
    description: 'Settings for the style and behavior of the visualization.',
    open: true,
    options: {
      startColor: {
        displayName: 'start color',
        description: 'Color to use for the start of the time range.',
        defaultValue: '#0000ff',
        type: 'color',
      },
      endColor: {
        displayName: 'end color',
        description: 'Color to use for the end of the time range.',
        defaultValue: '#ff0000',
        type: 'color',
      },
      lineWidth: {
        displayName: 'line width',
        description: 'Width of line when rendering.',
        defaultValue: 1,
        min: 1,
        max: 10,
        step: 0.1,
      },
    },
  },

  animation: {
    displayName: 'Animation',
    description: 'Settings for the looping animation of lines.',
    open: true,
    options: {
      enabled: {
        displayName: 'enabled',
        description: 'Whether animation is enabled.',
        defaultValue: false,
      },
      duration: {
        displayName: 'duration (ms)',
        description: 'How long the animation loop takes to complete.',
        defaultValue: 4000,
        min: 500,
        max: 10000,
        step: 500,
      },
      delay: {
        displayName: 'delay (ms)',
        description: 'How long to wait before restarting a finished loop.',
        defaultValue: 1000,
        min: 0,
        max: 3000,
        step: 100,
      },
      showStats: {
        displayName: 'show FPS',
        description: 'Whether to show the FPS stats meter.',
        defaultValue: false,
      },
    },
  },

};
