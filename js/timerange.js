/**
 * @fileoverview Implements a custom time range selector.
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

// TimeRange requires d3.
if (typeof d3 === 'undefined') {
  throw Error('D3 is required to create a TimeRange.');
}

var geovelo;
geovelo = geovelo || {};

/**
 * Implements a custom time range selector control. When the values represented
 * by the nubs change, TimeRange will emit custom 'range-changed' events on the
 * provided DOM element.
 *
 * @param {Element} containerElement The DOM element into which to insert.
 */
geovelo.TimeRange = function(containerElement) {

  // DOM Element into which to insert content.
  this.domElement = document.createElement('div');
  if (containerElement) {
    containerElement.appendChild(this.domElement);
  }

  // Date object representing the start of the time range.
  // Must be set in order to draw().
  this.extentStart = null;

  // Date object representing the end of the time range.
  // Must be set in order to draw().
  this.extentEnd = null;

  // Date object representing the position of the left (start) nub.
  this.rangeStart = null;

  // Date object representing the position of the right (end) nub.
  this.rangeEnd = null;

  // String representing the color to fill the start nub.
  this.startColor = null;

  // String representing the color to fill the end nub.
  this.endColor = null;

  // D3 scale for the time range. Will be updated on draw to match parameters.
  var timeScale = this.timeScale = d3.time.scale();

  // Insert root SVG element into the container element. Expand to fill.
  var svg = this.svg = d3.select(this.domElement).append('svg')
      .style('width', '100%').style('height', '100%');

  // Add a group element to the DOM for the time axis, to be filled later.
  svg.append('g').attr('class', 'time axis');

  // Initialize the drag behavior for nubs on the timeline.
  var self = this;
  this.dragBehavior = d3.behavior.drag()
      .origin(function (d) {
        return {
          x: timeScale(d.time),
          y: geovelo.TimeRange.margin.top
        };
      })
      .on('drag', function(d, i) {
        var MS_PER_DAY = 1000 * 60 * 60 * 24;

        // Invert drag distance to get a Date, then round to the nearest day,
        // accounting for timezone offset.
        var rawTs = +timeScale.invert(d3.event.x);
        var ts = rawTs - (rawTs % MS_PER_DAY) +
            new Date().getTimezoneOffset() * 60 * 1000;

        // Update sample start or end, maintaining minimum difference of 1 day.
        if (i === 0) {
          ts = Math.max(ts, +self.extentStart);
          ts = Math.min(ts, +self.rangeEnd - MS_PER_DAY);
          self.rangeStart = new Date(ts);
        } else {
          ts = Math.max(ts, +self.rangeStart + MS_PER_DAY);
          ts = Math.min(ts, +self.extentEnd);
          self.rangeEnd = new Date(ts);
        }
        self.drawNubs();
        self.emitRangeChange();
      });

  // Set up click handler for the timeline to allow non-drag clicks to snap.
  svg.on('click', this.clickHandler.bind(this));

  // Set up window resize handler
  window.addEventListener('resize', function() {
    if (self.extentStart && self.extentEnd) {
      self.draw();
    }
  });
};

/**
 * Set the color to use for the start of the range.
 *
 * @param {string} startColor The color to set for the start of the range.
 */
geovelo.TimeRange.prototype.setStartColor = function(startColor) {
  this.startColor = startColor;
  if (this.extentStart && this.extentEnd) {
    this.drawNubs();
  }
};

/**
 * Set the color to use for the end of the range.
 *
 * @param {string} endColor The color to set for the end of the range.
 */
geovelo.TimeRange.prototype.setEndColor = function(endColor) {
  this.endColor = endColor;
  if (this.extentStart && this.extentEnd) {
    this.drawNubs();
  }
};

/**
 * Set the extent of the time range selector. If range has not been set, this
 * will initialize the range to match.
 *
 * @param {Date} extentStart The start of the extent of the selector.
 * @param {Date} extentEnd The end of the extent of the selector.
 * @return {TimeRange} Return this TimeRange instance.
 */
geovelo.TimeRange.prototype.setExtent = function(extentStart, extentEnd) {
  if (!(extentStart instanceof Date) || !(extentEnd instanceof Date) ||
      extentStart >= extentEnd) {
    throw Error('Unacceptable extent parameters.');
  }
  this.extentStart = extentStart;
  this.extentEnd = extentEnd;
  var changed = false;
  if (this.rangeStart === null || this.rangeStart < this.extentStart) {
    this.rangeStart = extentStart;
    changed = true;
  }
  if (this.rangeEnd === null || this.rangeEnd > this.extendEnd) {
    this.rangeEnd = extentEnd;
  }
  if (changed) {
    this.draw();
    this.emitRangeChange();
  }
  return this;
};

/**
 * Set the range of the time range selector. If the extent has not yet been set,
 * then this will set the extent to match the range.
 *
 * @param {Date} rangeStart The start of the range of the selector.
 * @param {Date} rangeEnd The end of the range of the selector.
 * @return {TimeRange} Return this TimeRange instance.
 */
geovelo.TimeRange.prototype.setRange = function(rangeStart, rangeEnd) {
  if (!(rangeStart instanceof Date) || !(rangeEnd instanceof Date) ||
      rangeStart >= rangeEnd) {
    throw Error('Unacceptable range parameters.');
  }
  if (!this.extentStart || !this.extentEnd) {
    return this.setExtent(rangeStart, rangeEnd);
  }
  if (rangeStart < this.extentStart || rangeEnd > this.extentEnd) {
    throw Error('Range must be within specified extent.');
  }
  var changed = false;
  if (+rangeStart !== +this.rangeStart) {
    this.rangeStart = rangeStart;
    changed = true;
  }
  if (+rangeEnd !== +this.rangeEnd) {
    this.rangeEnd = rangeEnd;
    changed = true;
  }
  if (changed) {
    this.drawNubs();
    this.emitRangeChange();
  }
  return this;
};

/**
 * Handle clicks on the timeline so that clicks outside of the nubs will find
 * the nearest nub and snap it to that position.
 */
geovelo.TimeRange.prototype.clickHandler = function() {
  // Short-circuit if either extentStart or extentEnd has not been set.
  if (!this.extentStart || !this.extentEnd) {
    throw Error('Both extentStart and extentEnd must be set to handle clicks.');
  }

  // Short-circuit if this event has been handled by the nub drag behavior.
  if (d3.event.defaultPrevented) {
    return;
  }

  var MS_PER_DAY = 1000 * 60 * 60 * 24;
  var margin = geovelo.TimeRange.margin;

  // Event position offset is half of the margin plus the nub width.
  var offset = (margin.left + 4) / 2;

  // Determine the clamped position's date.
  var rawTs = this.timeScale.invert(d3.event.x - offset);
  var ts = rawTs - (rawTs % MS_PER_DAY) +
            new Date().getTimezoneOffset() * 60 * 1000;
  ts = Math.max(ts, +this.extentStart);
  ts = Math.min(ts, +this.extentEnd);
  var date = new Date(ts);

  if (Math.abs(ts - this.rangeStart) < Math.abs(ts - this.rangeEnd)) {
    this.rangeStart = date;
  } else {
    this.rangeEnd = date;
  }

  this.drawNubs();
  this.emitRangeChange();
};

/**
 * Emit a custom 'range-change' event on the container element.
 */
geovelo.TimeRange.prototype.emitRangeChange = function() {
  var event = new CustomEvent('range-changed', {
        bubbles: true,
        detail: {
          rangeStart: this.rangeStart,
          rangeEnd: this.rangeEnd
        }
      });
  this.domElement.dispatchEvent(event);
};

/**
 * Draw (or redraw) the TimeRange selector. This should be called automatically
 * by the constructor, or any time the characterists of the container change,
 * for example on window resize.
 */
geovelo.TimeRange.prototype.draw = function() {
  // Short-circuit if either extentStart or extentEnd has not been set.
  if (!this.extentStart || !this.extentEnd) {
    throw Error('Both extentStart and extentEnd must be set to draw TimeRange.');
  }

  // Show the container element--must be first for correct size calculations.
  this.domElement.style.display = '';

  // Get the svg bounding rect and margins.
  var svg = this.svg;
  var rect = svg.node().getBoundingClientRect();
  var margin = geovelo.TimeRange.margin;

  // Update the time scale to match.
  var timeScale = this.timeScale
      .domain([this.extentStart, this.extentEnd])
      .range([margin.left, rect.width - margin.right]);

  // Create a time axis for drawing the time line and labels.
  var timeAxis = d3.svg.axis()
      .scale(timeScale)
      .orient('bottom')
      .ticks(Math.max(rect.width/50, 2))
      .tickFormat(geovelo.TimeRange.format);

  // Get the group element that contains the time axis and fill it in.
  var g = svg.select('.time.axis')
      .attr('transform', 'translate(0,' + margin.top + ')')
      .call(timeAxis);

  // Place the draggable nubs.
  this.drawNubs();
};

/**
 * Draw the draggable time range selector nubs.
 */
geovelo.TimeRange.prototype.drawNubs = function() {
  // If this is the first draw(), then initialize the sample start and end.
  this.rangeStart = this.rangeStart || this.extentStart;
  this.rangeEnd = this.rangeEnd || this.extentEnd;

  // Get the draggable nub elements.
  var nubs = this.svg.selectAll('.nub')
      .data([{
        time: this.rangeStart,
        color: this.startColor,
      }, {
        time: this.rangeEnd,
        color: this.endColor,
      }]);

  // Insert DOM elements for the nubs if this is the first time.
  nubs.enter().append('g')
        .attr('class', 'nub')
        .style('cursor', 'pointer')
        .call(this.dragBehavior)
      .append('path')
        .attr('d', 'M -4,-16 v 8 l 4,6 l 4,-6 v -8 z');

  // Move nubs into their correct positions and set color.
  var timeScale = this.timeScale;
  nubs.attr('transform', function(d) {
    return 'translate(' + timeScale(d.time) + ',' +
        geovelo.TimeRange.margin.top + ')';
  }).select('.nub path')
    .attr('fill', function(d) { return d.color; });
};

/**
 * The amount of space in pixels to leave around the drawn elements.
 */
geovelo.TimeRange.margin = {
  left: 20,
  right: 20,
  top: 22
};

/**
 * This format is very nearly identical to the default used by d3.time.scale,
 * but uses shortened month names.
 */
geovelo.TimeRange.format = d3.time.format.multi([
  [".%L", function(d) { return d.getMilliseconds(); }],
  [":%S", function(d) { return d.getSeconds(); }],
  ["%I:%M", function(d) { return d.getMinutes(); }],
  ["%I %p", function(d) { return d.getHours(); }],
  ["%a %d", function(d) { return d.getDay() && d.getDate() != 1; }],
  ["%b %d", function(d) { return d.getDate() != 1; }],
  ["%b", function(d) { return d.getMonth(); }],
  ["%Y", function() { return true; }]
]);
