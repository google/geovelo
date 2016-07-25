/**
 * @fileoverview Controls for the Geodetic Velocities visualization.
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
 * Implements controls for the visualization.
 *
 * @param {Element} containerElement The DOM element into which to insert.
 */
geovelo.Controls = function(containerElement) {

  // Local reference to the geovelo settings object, throw if missing.
  var settings = geovelo.settings;
  if (!settings) {
    throw Error('geovelo.settings is missing!');
  }

  // DOM element into which to insert the controls.
  this.domElement = document.createElement('div');
  if (containerElement) {
    containerElement.appendChild(this.domElement);
  }

  // String that displays the current status of the visualization.
  this.status = 'waiting for data';

  // Percentage progress of the current operation, a number from 0 to 100.
  this.progress = 0;

  // Insert hidden file input for loading local data.
  var loadFileInput = this.loadFileInput = document.createElement('input');
  loadFileInput.style.display = 'none';
  loadFileInput.type = 'file';
  loadFileInput
      .addEventListener('change', this.loadFileChange.bind(this), false);
  this.domElement.appendChild(loadFileInput);

  // Instance of dat.GUI for managing most visualization controls.
  var gui = this.gui = new dat.GUI({
    autoPlace: false,
    width: 300
  });
  gui.add(this, 'status').listen();
  gui.add(this, 'progress', 0, 100).listen();

  // Collection of folders which have been added to the gui.
  var folders = this.folders = {};

  // Add buttons for downloading data and loading a local file.
  var folder = folders.data =
      gui.addFolder(settings.data.displayName || 'data');
  folder.add(this, 'downloadData').name('Download data.');
  folder.add(this, 'loadFile').name('Load local file.');

  // Object holding visualization state based on settings, bucketed by area.
  var state = this.state = {};

  // Build out local state object and gui representation from settings.
  Object.keys(settings).forEach(function(folderName) {
    var folderSettings = settings[folderName];
    var folderState = state[folderName] = {};
    var folder = folders[folderName];
    if (!folder) {
      folder = folders[folderName] =
          gui.addFolder(folderSettings.displayName || folderName);
    }
    if (folderSettings.open) {
      folder.open();
    }

    // Build out a control for each of the folder's options.
    Object.keys(folderSettings.options).forEach(function(optionName) {
      var option = folderSettings.options[optionName];
      folderState[optionName] = option.defaultValue;
      var ctrl;
      if (option.type === 'color') {
        ctrl = folder.addColor(folderState, optionName);
      } else {
        ctrl = folder.add(folderState, optionName);
      }
      if ('min' in option) {
        ctrl = ctrl.min(option.min);
      }
      if ('max' in option) {
        ctrl = ctrl.max(option.max);
      }
      if ('step' in option) {
        ctrl = ctrl.step(option.step);
      }
      ctrl = ctrl.listen();
      if ('displayName' in option) {
        ctrl = ctrl.name(option.displayName);
      }

      // Fire a custom 'settings-changed' event on the gui's DOM element when
      // a setting changes.
      ctrl.onChange(function(value) {
        var event = new CustomEvent('settings-changed', {
              bubbles: true,
              detail: {
                folderName: folderName,
                optionName: optionName,
                value: value
              }
            });
        gui.domElement.dispatchEvent(event);
      });
    });
  });

  // Finally, attach gui DOM element to the provided container element.
  this.domElement.appendChild(gui.domElement);

};

/**
 * Given a date, compute and set the sampleStart index.
 */
geovelo.Controls.prototype.setSampleStartDate = function(date) {

};

/**
 * On the next tick, parse incoming text as JSON, then proceed to prepare the
 * data as necessary.
 */
geovelo.Controls.prototype.parseText = function(text) {
  this.status = 'parsing data...';
  requestAnimationFrame(function() {
    try {
      var data = JSON.parse(text);
      this.prepareData(data);
    } catch (err) {
      this.status = 'ERROR: Invalid JSON.';
    }
  }.bind(this));
};

/**
 * Once raw data is ready (either downloaded or loaded locally from a file) we
 * need to apply corrections and compute intermediate values (like medians).
 */
geovelo.Controls.prototype.prepareData = function(data) {
  this.status = 'preparing data...';
  requestAnimationFrame(function() {
    geovelo.data.fillBeaconGaps(data);
    this.gui.domElement.dispatchEvent(
        new CustomEvent('data-ready', { bubbles: true, detail: data }));
  }.bind(this));
};

/**
 * Download a data file directly from the server.
 */
geovelo.Controls.prototype.downloadData = function() {

  this.status = 'downloading data...';

  // Update progress bar as download proceeds.
  var startTime = Date.now();
  var xhr = new XMLHttpRequest();
  xhr.addEventListener('progress', function(event) {
    var duration = Date.now() - startTime;
    var rate = event.loaded / duration;
    if (event.lengthComputable) {
      this.progress = 100 * event.loaded / event.total;
    } else {
      var totalGuess = 2e8;  // Assume file size is around 200MB.
      var threshold = 97;  // Maximum progress to show.
      this.progress = Math.min(100 * event.loaded / totalGuess, threshold);
    }
  }.bind(this), false);

  // Handle errors, or abort by the user.
  var handleError = function(event) {
    this.progress = 0;
    this.status = 'ERROR: Download failed.';
  }.bind(this);
  xhr.addEventListener('abort', handleError);
  xhr.addEventListener('error', handleError);

  // When the file is loaded, parse it.
  xhr.addEventListener('load', function(event) {
    this.progress = 100;
    this.parseText(xhr.responseText);
  }.bind(this));

  // Kick off the request.
  xhr.open('GET', 'data/beacon-data.json');
  xhr.send();
};

/**
 * Called when the user clicks the Load button on the controls. Triggers the
 * native file input's chooser dialog via a synthetic click event.
 */
geovelo.Controls.prototype.loadFile = function() {
  var event = document.createEvent('MouseEvents');
  event.initMouseEvent(
      'click', true, true, window,
      0, 0, 0, 0, 0,
      false, false, false, false,
      0, null
  );
  this.loadFileInput.value = null;
  this.loadFileInput.dispatchEvent(event);
};

/**
 * Called when the user has selected a file from the native file chooser for
 * the load file input.
 */
geovelo.Controls.prototype.loadFileChange = function(event) {

  // Get the file.
  var file = event.target.files[0];
  if (file) {
    this.status = 'reading data...';
  } else {
    this.status = 'ERROR: No file chosen.';
    return;
  }

  // Set up a file reader.
  var reader = new FileReader();
  reader.onload = function(event) {
    this.parseText(event.target.result);
  }.bind(this);
  reader.onprogress = function(event) {
    if (event.lengthComputable) {
      this.progress = 100 * event.loaded / event.total;
    }
  }.bind(this);
  reader.readAsText(file);

};
