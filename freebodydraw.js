'use strict';

/////////////////////////////////////////////////////
// Disable scrolling http://stackoverflow.com/a/4770179/2747370
function preventDefault(e) {
  e = e || window.event;
  if (e.preventDefault)
      e.preventDefault();
  e.returnValue = false;  
}

function preventDefaultForScrollKeys(e) {
    if (keys[e.keyCode]) {
        preventDefault(e);
        return false;
    }
}

function disableScroll() {
  if (window.addEventListener) // older FF
      window.addEventListener('DOMMouseScroll', preventDefault, false);
  window.onwheel = preventDefault; // modern standard
  window.onmousewheel = document.onmousewheel = preventDefault; // older browsers, IE
  window.ontouchmove  = preventDefault; // mobile
  document.onkeydown  = preventDefaultForScrollKeys;
}

function enableScroll() {
    if (window.removeEventListener)
        window.removeEventListener('DOMMouseScroll', preventDefault, false);
    window.onmousewheel = document.onmousewheel = null; 
    window.onwheel = null; 
    window.ontouchmove = null;  
    document.onkeydown = null;  
}

var VectorDraw = function(element_id, settings) {
    this.board = null;
    this.dragged_vector = null;
    this.drawMode = false;
    this.history_stack = {undo: [], redo: []};
    this.settings = this.sanitizeSettings(settings);
    this.element = $('#' + element_id);

    this.element.on('click', '.reset', this.reset.bind(this));
    this.element.on('click', '.add-vector', this.addElementFromList.bind(this));
    this.element.on('click', '.undo', this.undo.bind(this));
    this.element.on('click', '.redo', this.redo.bind(this));
    
    // Prevents default image drag and drop actions in some browsers.
    this.element.on('mousedown', '.jxgboard image', function(evt) { evt.preventDefault(); });

    this.render();
};

VectorDraw.prototype.sanitizeSettings = function(settings) {
    // Fill in defaults at top level of settings.
    var default_settings = {
        width: 550,
        height: 400,
        axis: false,
        background: null,
        bounding_box_size: 10,
        show_navigation: false,
        show_vector_properties: true,
        add_vector_label: 'Add Selected Force',
        vector_properties_label: 'Vector Properties',
        vectors: [],
        points: [],
        expected_result: {},
        custom_checks: [],
        unit_vector_ratio: 1
    };
    _.defaults(settings, default_settings);
    var width_scale = settings.width / settings.height,
        box_size = settings.bounding_box_size;
    settings.bounding_box = [-box_size*width_scale, box_size, box_size*width_scale, -box_size]

    // Fill in defaults for vectors.
    var default_vector = {
        type: 'vector',
        render: false,
        length_factor: 1,
        length_units: '',
        base_angle: 0
    };
    var default_vector_style = {
        pointSize: 1,
        pointColor: 'red',
        width: 4,
        color: "blue",
        label: null,
        labelColor: 'black'
    };
    settings.vectors.forEach(function(vector) {
        _.defaults(vector, default_vector);
        if (!_.has(vector, 'style')) {
            vector.style = {};
        }
        _.defaults(vector.style, default_vector_style);
    });

    // Fill in defaults for points.
    var default_point = {
        fixed: true,  // Default to true for backwards compatibility.
        render: true
    };
    var default_point_style = {
        size: 1,
        withLabel: false,
        color: 'pink',
        showInfoBox: false
    };
    settings.points.forEach(function(point) {
        _.defaults(point, default_point);
        if (!_.has(point, 'style')) {
            point.style = {};
        }
        _.defaults(point.style, default_point_style);
        point.style.name = point.name;
        point.style.fixed = point.fixed;
        point.style.strokeColor = point.style.color;
        point.style.fillColor = point.style.color;
        delete point.style.color;
    });

    return settings;
}

VectorDraw.prototype.template = _.template([
    '<div class="jxgboard" style="width:<%= width %>px; height:<%= height %>px;" />',
    '<div class="menu">',
    '    <div class="controls">',
    '        <select>',
    '        <% vectors.forEach(function(vec, idx) { %>',
    '            <option value="vector-<%= idx %>"><%= vec.description %></option>',
    '        <% }) %>',
    '        <% points.forEach(function(point, idx) { if (!point.fixed) { %>',
    '            <option value="point-<%= idx %>"><%= point.description %></option>',
    '        <% }}) %>',
    '        </select>',
    '        <button class="add-vector"><%= add_vector_label %></button>',
    '        <button class="reset">Reset</button>',
    '        <button class="undo" title="Undo"><span class="fa fa-undo" /></button>',
    '        <button class="redo" title="redo"><span class="fa fa-repeat" /></button>',
    '    </div>',
    '    <% if (show_vector_properties) { %>',
    '      <div class="vector-properties">',
    '        <h3><%= vector_properties_label %></h3>',
    '        <div class="vector-prop-name">',
    '          name: <span class="value vector-prop-bold">-</span>',
    '        </div>',
    '        <div class="vector-prop-length">',
    '          length: <span class="value">-</span>',
    '        </div>',
    '        <div class="vector-prop-angle">',
    '          angle: <span class="value">-</span>&deg;',
    '        </div>',
    '        <div class="vector-prop-slope">',
    '          slope: <span class="value">-</span>',
    '        </div>',
    '      </div>',
    '    <% } %>',
    '</div>'
].join('\n'));

VectorDraw.prototype.render = function() {
    this.element.html(this.template(this.settings));
    // Assign the jxgboard element a random unique ID,
    // because JXG.JSXGraph.initBoard needs it.
    this.element.find('.jxgboard').prop('id', _.uniqueId('jxgboard'));
    this.createBoard();
};

VectorDraw.prototype.createBoard = function() {
    var id = this.element.find('.jxgboard').prop('id'),
        self = this;

    this.board = JXG.JSXGraph.initBoard(id, {
        keepaspectratio: true,
        boundingbox: this.settings.bounding_box,
        axis: this.settings.axis,
        showCopyright: false,
        showNavigation: this.settings.show_navigation
    });

    function getImageRatio(bg, callback) {
        $('<img/>').attr('src', bg.src).load(function(){
            //technically it's inverse of ratio, but we need it to calculate height
            var ratio = this.height / this.width;
            callback(bg, ratio);
        });
    }

    function drawBackground(bg, ratio) {
        var height = (bg.height) ? bg.height : bg.width * ratio;
        var coords = (bg.coords) ? bg.coords : [-bg.width/2, -height/2];
        self.board.create('image', [bg.src, coords, [bg.width, height]], {fixed: true});
    }

    if (this.settings.background) {
        if (this.settings.background.height) {
            drawBackground(this.settings.background);
        }
        else {
            getImageRatio(this.settings.background, drawBackground);
        }
    }

    this.settings.points.forEach(function(point, idx) {
        if (point.render) {
            this.renderPoint(idx);
        }
    }, this);

    this.settings.vectors.forEach(function(vec, idx) {
        if (vec.render) {
            this.renderVector(idx);
        }
    }, this);

    this.board.on('down', this.onBoardDown.bind(this));
    this.board.on('move', this.onBoardMove.bind(this));
    this.board.on('up', this.onBoardUp.bind(this));
};

VectorDraw.prototype.renderPoint = function(idx, coords) {
    var point = this.settings.points[idx];
    var coords = coords || point.coords;
    var board_object = this.board.elementsByName[point.name];
    if (board_object) {
        // If the point is already rendered, only update its coordinates.
        board_object.setPosition(JXG.COORDS_BY_USER, coords);
        return;
    }
    this.board.create('point', coords, point.style);
    if (!point.fixed) {
        // Disable the <option> element corresponding to point.
        var option = this.getMenuOption('point', idx);
        option.prop('disabled', true).prop('selected', false);
    }
}

VectorDraw.prototype.removePoint = function(idx) {
    var point = this.settings.points[idx];
    var object = this.board.elementsByName[point.name];
    if (object) {
        this.board.removeAncestors(object);
        // Enable the <option> element corresponding to point.
        var option = this.getMenuOption('point', idx);
        option.prop('disabled', false);
    }
};

VectorDraw.prototype.getVectorCoordinates = function(vec) {
    var coords = vec.coords;
    if (!coords) {
        var tail = vec.tail || [0, 0];
        var length = 'length' in vec ? vec.length : 5;
        var angle = 'angle' in vec ? vec.angle : 30;
        var radians = angle * Math.PI / 180;
        var tip = [
            tail[0] + Math.cos(radians) * length,
            tail[1] + Math.sin(radians) * length
        ];
        coords = [tail, tip];
    }
    return coords;
};

VectorDraw.prototype.getVectorStyle = function(vec) {
    //width, color, size of control point, label (which should be a JSXGraph option)
    var default_style = {
        pointSize: 1,
        pointColor: 'red',
        width: 4,
        color: "blue",
        label: null,
        labelColor: 'black'
    };

    return _.extend(default_style, vec.style);
};

VectorDraw.prototype.renderVector = function(idx, coords) {
    var vec = this.settings.vectors[idx];
    coords = coords || this.getVectorCoordinates(vec);

    // If this vector is already rendered, only update its coordinates.
    var board_object = this.board.elementsByName[vec.name];
    if (board_object) {
        board_object.point1.setPosition(JXG.COORDS_BY_USER, coords[0]);
        board_object.point2.setPosition(JXG.COORDS_BY_USER, coords[1]);
        return;
    }

    var style = vec.style;

    var tail = this.board.create('point', coords[0], {
        name: vec.name,
        size: style.pointSize,
        fillColor: style.pointColor,
        strokeColor: style.pointColor,
        withLabel: false,
        fixed: (vec.type === 'arrow' | vec.type === 'vector'),
        showInfoBox: false
    });
    var tip = this.board.create('point', coords[1], {
        name: style.label || vec.name,
        size: style.pointSize,
        fillColor: style.pointColor,
        strokeColor: style.pointColor,
        withLabel: true,
        showInfoBox: false,
        label:{}
    });
    // Not sure why, but including labelColor in attributes above doesn't work,
    // it only works when set explicitly with setAttribute.
    tip.setAttribute({labelColor: style.labelColor});

    var line_type = (vec.type === 'vector') ? 'arrow' : vec.type;
    var line = this.board.create(line_type, [tail, tip], {
        name: vec.name,
        strokeWidth: style.width,
        strokeColor: style.color
    });

    tip.label.setAttribute({fontsize: 18, highlightStrokeColor: 'black'});

    // Disable the <option> element corresponding to vector.
    var option = this.getMenuOption('vector', idx);
    option.prop('disabled', true).prop('selected', false);

    return line;
};

VectorDraw.prototype.removeVector = function(idx) {
    var vec = this.settings.vectors[idx];
    var object = this.board.elementsByName[vec.name];
    if (object) {
        this.board.removeAncestors(object);
        // Enable the <option> element corresponding to vector.
        var option = this.getMenuOption('vector', idx);
        option.prop('disabled', false);
    }
};

VectorDraw.prototype.getMenuOption = function(type, idx) {
    return this.element.find('.menu option[value=' + type + '-' + idx + ']');
};

VectorDraw.prototype.getSelectedElement = function() {
    var selector = this.element.find('.menu select').val();
    if (selector) {
        selector = selector.split('-');
        return {
            type: selector[0],
            idx: parseInt(selector[1])
        }
    }
    return {};
};

VectorDraw.prototype.addElementFromList = function() {
    this.pushHistory();
    var selected = this.getSelectedElement();
    if (selected.type === 'vector') {
        this.updateVectorProperties(this.renderVector(selected.idx));
    } else {
        this.renderPoint(selected.idx);
    }
};

VectorDraw.prototype.reset = function() {
    this.pushHistory();
    JXG.JSXGraph.freeBoard(this.board);
    this.render();
};

VectorDraw.prototype.pushHistory = function() {
    var state = this.getState();
    var previous_state = _.last(this.history_stack.undo);
    if (!_.isEqual(state, previous_state)) {
      this.history_stack.undo.push(state);
      this.history_stack.redo = [];
    }
};

VectorDraw.prototype.undo = function() {
    var curr_state = this.getState();
    var undo_state = this.history_stack.undo.pop();
    if (undo_state && !_.isEqual(undo_state, curr_state)) {
        this.history_stack.redo.push(curr_state);
        this.setState(undo_state);
    }
};

VectorDraw.prototype.redo = function() {
    var state = this.history_stack.redo.pop();
    if (state) {
        this.history_stack.undo.push(this.getState());
        this.setState(state);
    }
};

VectorDraw.prototype.getMouseCoords = function(evt) {
    var i = evt[JXG.touchProperty] ? 0 : undefined;
    var c_pos = this.board.getCoordsTopLeftCorner(evt, i);
    var abs_pos = JXG.getPosition(evt, i);
    var dx = abs_pos[0] - c_pos[0];
    var dy = abs_pos[1] - c_pos[1];

    return new JXG.Coords(JXG.COORDS_BY_SCREEN, [dx, dy], this.board);
};

VectorDraw.prototype.getVectorForObject = function(obj) {
    if (obj instanceof JXG.Line) {
        return obj;
    }
    if (obj instanceof JXG.Text) {
        return this.getVectorForObject(obj.element);
    }
    if (obj instanceof JXG.Point) {
        return _.find(obj.descendants, function (d) { return (d instanceof JXG.Line); });
    }
    return null;
};

VectorDraw.prototype.getVectorSettingsByName = function(name) {
    return _.find(this.settings.vectors, function(vec) {
        return vec.name === name;
    });
};

VectorDraw.prototype.updateVectorProperties = function(vector) {
    var vec_settings = this.getVectorSettingsByName(vector.name);
    var x1 = vector.point1.X(),
        y1 = vector.point1.Y(),
        x2 = vector.point2.X(),
        y2 = vector.point2.Y();
    var length = vec_settings.length_factor * Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
    var slope = (y2-y1)/(x2-x1);
    var angle = ((Math.atan2(y2-y1, x2-x1)/Math.PI*180) - vec_settings.base_angle) % 360;
    if (angle < 0) {
        angle += 360;
    }
    $('.vector-prop-name .value', this.element).html(vector.point2.name); // labels are stored as point2 names
    $('.vector-prop-angle .value', this.element).html(angle.toFixed(2));
    if (vector.elType !== "line") {
        $('.vector-prop-length', this.element).show();
        $('.vector-prop-length .value', this.element).html(length.toFixed(2) + ' ' + vec_settings.length_units);
        $('.vector-prop-slope', this.element).hide();
    }
    else {
        $('.vector-prop-length', this.element).hide();
        if (this.settings.show_slope_for_lines) {
            $('.vector-prop-slope', this.element).show();
            $('.vector-prop-slope .value', this.element).html(slope.toFixed(2));
        }
    }
};

VectorDraw.prototype.isVectorTailDraggable = function(vector) {
    return vector.elType !== 'arrow';
};

VectorDraw.prototype.canCreateVectorOnTopOf = function(el) {
    // If the user is trying to drag the arrow of an existing vector, we should not create a new vector.
    if (el instanceof JXG.Line) {
        return false;
    }
    // If this is tip/tail of a vector, it's going to have a descendant Line - we should not create a new vector
    // when over the tip. Creating on top of the tail is allowed for plain vectors but not for segments.
    // If it doesn't have a descendant Line, it's a point from settings.points - creating a new vector is allowed.
    if (el instanceof JXG.Point) {
        var vector = this.getVectorForObject(el);
        if (!vector) {
            return el.getProperty('fixed');
        } else if (el === vector.point1 && !this.isVectorTailDraggable(vector)) {
            return true;
        } else {
            return false;
        }
    }
    return true;
};

VectorDraw.prototype.objectsUnderMouse = function(coords) {
    var filter = function(el) {
        return !(el instanceof JXG.Image) && el.hasPoint(coords.scrCoords[1], coords.scrCoords[2]);
    };
    return _.filter(_.values(this.board.objects), filter);
};

VectorDraw.prototype.onBoardDown = function(evt) {
    this.pushHistory();
    // Can't create a vector if none is selected from the list.
    var selected = this.getSelectedElement();
    var coords = this.getMouseCoords(evt);
    var targetObjects = this.objectsUnderMouse(coords);
    if (!_.isEmpty(selected) && (!targetObjects || _.all(targetObjects, this.canCreateVectorOnTopOf.bind(this)))) {
        var point_coords = [coords.usrCoords[1], coords.usrCoords[2]];
        if (selected.type === 'vector') {
            this.drawMode = true;
            disableScroll();
            this.dragged_vector = this.renderVector(selected.idx, [point_coords, point_coords]);
        } else {
            this.renderPoint(selected.idx, point_coords);
        }
    }
    else {
        this.drawMode = false;
        var vectorPoint = _.find(targetObjects, this.getVectorForObject.bind(this));
        if (vectorPoint) {
            this.dragged_vector = this.getVectorForObject(vectorPoint);
            this.dragged_vector.point1.setProperty({fixed: false});
            this.updateVectorProperties(this.dragged_vector);
        }
    }
};

VectorDraw.prototype.onBoardMove = function(evt) {
    if (this.drawMode) {
        var coords = this.getMouseCoords(evt);
        this.dragged_vector.point2.moveTo(coords.usrCoords);
    }
    if (this.dragged_vector) {
        this.updateVectorProperties(this.dragged_vector);
    }
};

VectorDraw.prototype.onBoardUp = function(evt) {
    enableScroll();
    this.drawMode = false;
    if (this.dragged_vector && !this.isVectorTailDraggable(this.dragged_vector)) {
        this.dragged_vector.point1.setProperty({fixed: true});
    }
    this.dragged_vector = null;
};

VectorDraw.prototype.getVectorCoords = function(name) {
    var object = this.board.elementsByName[name];
    if (object) {
        return {
            tail: [object.point1.X(), object.point1.Y()],
            tip: [object.point2.X(), object.point2.Y()]
        };
    }
};

VectorDraw.prototype.getState = function() {
    var vectors = {}, points = {};
    this.settings.vectors.forEach(function(vec) {
        var coords = this.getVectorCoords(vec.name);
        if (coords) {
            vectors[vec.name] = coords;
        }
    }, this);
    this.settings.points.forEach(function(point) {
        var obj = this.board.elementsByName[point.name];
        if (obj) {
            points[point.name] = [obj.X(), obj.Y()];
        }
    }, this);
    return {vectors: vectors, points: points};
};

VectorDraw.prototype.setState = function(state) {
    this.settings.vectors.forEach(function(vec, idx) {
        var vec_state = state.vectors[vec.name];
        if (vec_state) {
            this.renderVector(idx, [vec_state.tail, vec_state.tip]);
        } else {
            this.removeVector(idx);
        }
    }, this);
    this.settings.points.forEach(function(point, idx) {
        var point_state = state.points[point.name];
        if (point_state) {
            this.renderPoint(idx, point_state);
        } else {
            this.removePoint(idx);
        }
    }, this);
    this.board.update();
};


/////////////////////////////////////////////////////
var FreeBodyDraw = function(element_id, settings){
    settings.vectors = this.forceVectorsFromDescriptors(settings.forceDescriptors);

    this.currentActiveVectorIdx = null;
    settings.activeStyle = {
        lightness: -0.5,
        widthMultiplier:1.5
    };

    VectorDraw.call(this, element_id, settings );
    
    this.element.on('change', '#type',this.onDescriptionChange.bind(this));
    this.element.on('change', '#on',this.onDescriptionChange.bind(this));
    this.element.on('change', '#from',this.onDescriptionChange.bind(this));
    this.element.on('keydown',this.onKeyDown.bind(this));
    
    this.element.on('click', '.delete-vector', this.onDeleteDown.bind(this));
}
// These next two lines makes FreeBodyDraw a sub-class of VectorDraw http://stackoverflow.com/a/8460616/2747370
FreeBodyDraw.prototype = Object.create( VectorDraw.prototype );
FreeBodyDraw.prototype.constructor = FreeBodyDraw;

FreeBodyDraw.prototype.template = _.template([
    '<div class="header">',
    '<div class="menu">',
    '   <div class="controls">',
        // This must be first <select>! (Can be hidden)
    '       <select id="select-vector" class="hidden">',
    '           <!--Blank option prevents drawing w/o updating descriptors-->',
    '           <option></option>',
    '           <option value="none" disabled="true"></option>',
    '           <% vectors.forEach(function(vec, idx) { %>',
    '           <option value="vector-<%= idx %>"><%= vec.description %></option>',
    '           <% }) %>',
    '           <% points.forEach(function(point, idx) { if (!point.fixed) { %>',
    '           <option value="point-<%= idx %>"><%= point.description %></option>',
    '           <% }}) %>',
    '       </select>',
    '       <fieldset>',
    '           <legend>Select a force to draw.</legend>',
    '           <p>',
    '               <label>on: </label>',
    '               <select id="on">',
    '                   <option disabled selected>Select...</option>',
    '                   <% forceDescriptors[1].shortNames.forEach(function(val,idx) { %>',
    '                   <option value="<%=val%>"> <%= forceDescriptors[1].longNames[idx] %> </option>',
    '                   <% }) %>',
    '               </select>',
    '               <span id="on-warning" class="warning hidden">',
    '                   <i class="fa fa-exclamation-triangle"></i>',
    '               </span>',
    '           </p>',
    '           <p>',
    '               <label>from: </label>',
    '               <select id="from">',
    '                   <option disabled selected>Select...</option>',
    '                   <% forceDescriptors[2].shortNames.forEach(function(val,idx) { %>',
    '                   <option value="<%=val%>"> <%= forceDescriptors[2].longNames[idx] %> </option>',
    '                   <% }) %>',
    '               </select>',
    '               <span id="from-warning" class="warning hidden">',
    '                   <i class="fa fa-exclamation-triangle"></i>',
    '               </span>',
    '           </p>',
    '           <p>',
    '               <label>type: </label>',
    '               <select id="type">',
    '                   <option disabled selected>Select...</option>',
    '                   <% forceDescriptors[0].shortNames.forEach(function(val,idx) { %>',
    '                   <option value="<%=val%>"> <%= forceDescriptors[0].longNames[idx] %> </option>',
    '                   <% }) %>',
    '               </select>',
    '           </p>',
    '       </fieldset>',
    '   </div>',
    '   <div class="vector-properties">',
    '       <br>',
    '       <div class="vector-prop-name vector-prop-bold">',
    '           <span>Force:</span><br>',
    '           <span class="value">-</span>',
    '       </div>',
    '   </div>',
    '   <% if (show_vector_properties) { %>',
    '   <div class="vector-properties">',
//  '       <h3><%= vector_properties_label %></h3>',
    '       <br>',
    '       <div class="vector-prop-length">',
    '           length: <span class="value">-</span>',
    '       </div>',
    '       <div class="vector-prop-angle">',
    '           angle: <span class="value">-</span>&deg;',
    '       </div>',
    '       <div class="vector-prop-slope">',
    '           slope: <span class="value">-</span>',
    '       </div>',
    '   </div>',
    '   <% } %>',
    '</div>',
    '</div>',
    '<div class="jxgboard" style="width:<%= width %>px; height:<%= height %>px;" />',
    '<div class="footer">',
    '<div class="menu">',
    '   <div class="controls">',
    '       <button class="delete-vector">Delete</button>',
    '       <button class="reset">Reset</button>',
    '       <button class="undo" title="Undo"><span class="fa fa-undo" /></button>',
    '       <button class="redo" title="redo"><span class="fa fa-repeat" /></button>',
    '   </div>',
    '</div>',
    '</div>',
].join('\n'));

FreeBodyDraw.prototype.forceVectorsFromDescriptors = function(descriptors){
    var type = descriptors[0].shortNames;
    var on = descriptors[1].shortNames;
    var from = descriptors[2].shortNames;
    var vectors = [];
    for (var i in type){
        for (var j in on){
            for (var k in from){
                if (on[j] != from[k]){
                    var vec = {};
                    vec.name = [type[i],on[j],from[k]].join("_");
                    vec.description = vec.name;
                    vec.render = false;
                    vec.style = {};
                    vec.style.label = "<span>" + type[i] + "<sub>" + on[j] + "," + from[k] + "</sub>" + "</span>";
                    vec.forceType ={};
                    vec.forceType.short = type[i];
                    vec.forceType.long = descriptors[0].longNames[i];
                    vec.on ={};
                    vec.on.short = on[j];
                    vec.on.long = descriptors[1].longNames[j];
                    vec.from ={};
                    vec.from.short = from[k];
                    vec.from.long = descriptors[2].longNames[k];
                    vectors.push(vec);
                }
            }
        }
    }
    return vectors;
}

FreeBodyDraw.prototype.getNamedVectorIdx = function(vecName){
    var vecIdx = _.findIndex(this.settings.vectors, function(vec) {
        return vec.name === vecName;
    });
    return vecIdx
}

FreeBodyDraw.prototype.getDescribedVectorIdx = function(){
    var vecName = [
        this.element.find('#type').val(),
        this.element.find('#on').val(),
        this.element.find('#from').val()
    ].join("_");
    return this.getNamedVectorIdx(vecName);
}

FreeBodyDraw.prototype.setActiveFromDescription = function(){
    var oldIdx = this.currentActiveVectorIdx;
    var newIdx = this.getDescribedVectorIdx();
    //Style old active vector as inactive
    if (oldIdx != null && this.isDrawn(oldIdx) ){
        this.styleVectorAsInactive(oldIdx);
    }
    //Style new active vector as active
    if (this.isDrawn(newIdx)) {
        this.styleVectorAsActive(newIdx);
    }
    
    this.setSelectedFromIdx(newIdx);
    this.currentActiveVectorIdx = newIdx;
    
    this.updateDeleteStatus();
}

FreeBodyDraw.prototype.setSelectedFromIdx = function(vecIdx){
    this.element.find("#select-vector")[0].value = ("vector-" + vecIdx);
}

FreeBodyDraw.prototype.updateDescriptionFromVector = function(vector){
    var type_on_from = vector.name.split("_");
    //Changing a value with .val does not automatically trigger the change event, so we must trigger it ourselves.
    this.element.find("#type").val(type_on_from[0]).trigger('change');
    this.element.find("#on").val(type_on_from[1]).trigger('change');
    this.element.find("#from").val(type_on_from[2]).trigger('change');
}

// Inherit updateVectorProperties for updating drawn vectors
FreeBodyDraw.prototype.updateVectorProperties = function(vector){
    VectorDraw.prototype.updateVectorProperties.call(this,vector);

    var describedVecIdx = this.getDescribedVectorIdx();
    var describedVecName = this.settings.vectors[describedVecIdx].name;

    //If described vec does not match selected vector, update described vec
    if (vector.name === describedVecName){
        return;
    } else{
        this.updateDescriptionFromVector(vector);
    }
}
// Add a method for updating UN-drawn or non-existant vector proerties
FreeBodyDraw.prototype.updateUndrawnVectorProperties = function(vector){
    $('.vector-prop-length .value', this.element).html("");
    $('.vector-prop-angle .value', this.element).html("");
    //update vector label; if vector does not exist, show blank name.
    if (vector===undefined){
        var vecLabel = "-";
    } else {
        var vecLabel = vector.style.label;
    }
    $('.vector-prop-name .value', this.element).html(vecLabel);
}

FreeBodyDraw.prototype.render = function(){
    VectorDraw.prototype.render.call(this);
    this.updateButtonsStatus();
    $('.reset',this.element).addClass('inactive');
}

FreeBodyDraw.prototype.redo = function(){
    if ($('.redo',this.element).hasClass('inactive')){
        return;
    }
    VectorDraw.prototype.redo.call(this);
    this.setActiveFromDescription();
    this.updateButtonsStatus();
}

FreeBodyDraw.prototype.undo = function(){
    if ($('.undo',this.element).hasClass('inactive')){
        return;
    }
    VectorDraw.prototype.undo.call(this);
    this.setActiveFromDescription();
    this.updateButtonsStatus();
}

FreeBodyDraw.prototype.reset = function(){
    if ($('.reset',this.element).hasClass('inactive')){
        return;
    }
    var state = VectorDraw.prototype.reset.call(this);
}

FreeBodyDraw.prototype.onDeleteDown = function(){
    var selectedIdx = this.getDescribedVectorIdx();
    this.pushHistory();
    this.removeVector(selectedIdx);
    this.setActiveFromDescription();
    this.updateButtonsStatus();
}

// Has styling differences from VectorDraw.prototype.renderVector
FreeBodyDraw.prototype.renderVector = function(idx, coords) {
    var vec = this.settings.vectors[idx];
    coords = coords || this.getVectorCoordinates(vec);

    // If this vector is already rendered, only update its coordinates.
    var board_object = this.board.elementsByName[vec.name];
    if (board_object) {
        board_object.point1.setPosition(JXG.COORDS_BY_USER, coords[0]);
        board_object.point2.setPosition(JXG.COORDS_BY_USER, coords[1]);
        return;
    }
    
    var style = vec.style,
        labelStyle = "vec-label"
    //If this vector is the active vector, style it as such. (Vectors rendered by redo are not automatically active.)
    if (idx === this.currentActiveVectorIdx){
        style = this.makeActiveStyle(style);
        labelStyle += " active"
    } 

    //tip and tail are used to draw vector
    //labelPoint is used to place the label a constant distance from vector tip in the direction of the vector
    var tail = this.board.create('point', coords[0], {
        name: vec.name,
        size: -1, //FreeBodyDraw always uses arrows, so do not display tail point
        fillColor: style.pointColor,
        strokeColor: style.pointColor,
        withLabel: false,
        fixed: (vec.type === 'arrow' | vec.type === 'vector'),
        showInfoBox: false
    });
    var tip = this.board.create('point', coords[1], {
        name: style.label || vec.name,
        size: style.pointSize,
        fillColor: style.pointColor,
        strokeColor: style.pointColor,
        withLabel: false,
        showInfoBox: false,
        label:{
            offset:[0,0]
        }
    });
    var labelPoint = this.board.createElement('point',[
        function(){ 
            var x1 = tail.X(),
                x2 = tip.X(),
                y1 = tail.Y(),
                y2 = tip.Y();
            var x = tip.X() + labelDistance(x2-x1,y2-y1)*unitVector([x1,y1], [x2,y2])[0];
            return x;
        },
        function(){ 
            var x1 = tail.X(),
                x2 = tip.X(),
                y1 = tail.Y(),
                y2 = tip.Y();
            var y = tip.Y() + labelDistance(x2-x1,y2-y1)*unitVector([x1,y1], [x2,y2])[1];
            return y;
        }
    ],
    {
        name: style.label,
        size:-1,
        showInfoBox:false,
        label:{
            offset:[0,0],
            highlightStrokeColor:'black',
            cssClass: labelStyle,
            highlightCssClass: labelStyle,
            highlightStrokeColor: 'black',
        }
    });
    function unitVector(p1,p2){
        var dx = p2[0] - p1[0],
            dy = p2[1] - p1[1],
            ds = Math.sqrt(dx*dx + dy*dy);
            
        var ux, uy;
        if (dx === 0){
            ux = 0;
        } else {
            ux = dx/ds;
        }
        
        if (dy === 0){
            uy = 0;
        } else {
            uy = dy/ds;
        }
        
        return [ux, uy];
    }
    function labelDistance(x,y){
        //sets distance of labelPoint from tip. Idea is to have a larger offset along -x axis.
        //Could be improved ... a larger offset might be nice along -y axis.
        var L = 1.0,
            a = 5;
            
        return 0.5 + L*a*(Math.abs(x)-x)/(1+a*Math.abs(x)+4*y*y);
    }

    var line_type = (vec.type === 'vector') ? 'arrow' : vec.type;
    var line = this.board.create(line_type, [tail, tip], {
        name: vec.name,
        strokeWidth: style.width,
        strokeColor: style.color
    });

    // Disable the <option> element corresponding to vector.
    var option = this.getMenuOption('vector', idx);
    option.prop('disabled', true).prop('selected', false);

    return line;
};

FreeBodyDraw.prototype.removeVector = function(idx) {
    var vec = this.settings.vectors[idx];
    var object = this.board.elementsByName[vec.name];
    var label = this.board.elementsByName[vec.style.label];
    if (object) {
        this.board.removeAncestors(object);
        this.board.removeAncestors(label);
        // Enable the <option> element corresponding to vector.
        var option = this.getMenuOption('vector', idx);
        option.prop('disabled', false);
    }
};

FreeBodyDraw.prototype.isDrawn = function(vecIdx){
    if (vecIdx === null){
        return null
    } else {
        return this.getMenuOption('vector', vecIdx)[0].hasAttribute("disabled")
    }   
}

FreeBodyDraw.prototype.onDescriptionChange = function(){
    console.log("onDescriptionChange")
    var abort = false;
    var onVal = $("#on", this.element).val(),
        fromVal = $("#from", this.element).val(),
        typeVal = $("#type", this.element).val();
    //If any option is blank, return immediately.
    //Should never happen once a vector has been selected
    if (onVal === null || fromVal === null || typeVal === null ){
        abort = true;
    }
    
    //Objects cannot exert forces on themselves; if on=by, warn user
    //deactive active vector, change properties, and exit.
    if (onVal === fromVal && onVal != null ){
        $("#on-warning", this.element).removeClass('hidden');
        $("#from-warning", this.element).removeClass('hidden');
        this.element.find("#select-vector")[0].value = ("none");
        this.updateUndrawnVectorProperties(vector);
        var oldIdx = this.currentActiveVectorIdx;
        if (oldIdx != null && this.isDrawn(oldIdx) ){
            this.styleVectorAsInactive(oldIdx);
        }
        abort = true;
    } else {
        $("#on-warning", this.element).addClass('hidden');
        $("#from-warning", this.element).addClass('hidden');
    }
    
    if (abort){
        return;
    }
    
    var vecIdx = this.getDescribedVectorIdx();
    var vector = this.settings.vectors[vecIdx];
    if (this.isDrawn(vecIdx)){
        var jsxgVector = this.findJSXGVector(vecIdx);
        this.updateVectorProperties(jsxgVector);
    } else {
        this.updateUndrawnVectorProperties(vector);
    }
    this.setActiveFromDescription();
}

FreeBodyDraw.prototype.findJSXGVector = function(vecIdx){
    var vector = this.settings.vectors[vecIdx];
    var jsxgVector = this.board.objectsList.filter(function( obj ) {
              return obj.name == vector.name && obj.elType == "arrow";
            })[0];
            
    return jsxgVector;
}

FreeBodyDraw.prototype.findJSXGVectorLabelPoint = function(vecIdx){
    var vectorLabel = this.settings.vectors[vecIdx].style.label;
    var jsxgLabelPoint = this.board.objectsList.filter(function( obj ) {
        return obj.name == vectorLabel && obj.hasLabel;
    })[0];
    
    return jsxgLabelPoint;
}

FreeBodyDraw.prototype.lightenColor = function(color, amt){
    //color should be hex or named. First get hex color if it is named
    if (color[0] != "#"){
        //http://www.w3schools.com/colors/colors_names.asp
        color = color.toLowerCase();
        var namedColors = {
            aliceblue: '#F0F8FF', antiquewhite: '#FAEBD7', aqua: '#00FFFF', aquamarine: '#7FFFD4', azure: '#F0FFFF', beige: '#F5F5DC', bisque: '#FFE4C4', black: '#000000', blanchedalmond: '#FFEBCD', blue: '#0000FF', blueviolet: '#8A2BE2', brown: '#A52A2A', burlywood: '#DEB887', cadetblue: '#5F9EA0', chartreuse: '#7FFF00', chocolate: '#D2691E', coral: '#FF7F50', cornflowerblue: '#6495ED', cornsilk: '#FFF8DC', crimson: '#DC143C', cyan: '#00FFFF', darkblue: '#00008B', darkcyan: '#008B8B', darkgoldenrod: '#B8860B', darkgray: '#A9A9A9', darkgrey: '#A9A9A9', darkgreen: '#006400', darkkhaki: '#BDB76B', darkmagenta: '#8B008B', darkolivegreen: '#556B2F', darkorange: '#FF8C00', darkorchid: '#9932CC', darkred: '#8B0000', darksalmon: '#E9967A', darkseagreen: '#8FBC8F', darkslateblue: '#483D8B', darkslategray: '#2F4F4F', darkslategrey: '#2F4F4F', darkturquoise: '#00CED1', darkviolet: '#9400D3', deeppink: '#FF1493', deepskyblue: '#00BFFF', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1E90FF', firebrick: '#B22222', floralwhite: '#FFFAF0', forestgreen: '#228B22', fuchsia: '#FF00FF', gainsboro: '#DCDCDC', ghostwhite: '#F8F8FF', gold: '#FFD700', goldenrod: '#DAA520', gray: '#808080', grey: '#808080', green: '#008000', greenyellow: '#ADFF2F', honeydew: '#F0FFF0', hotpink: '#FF69B4', indianred: '#CD5C5C', indigo: '#4B0082', ivory: '#FFFFF0', khaki: '#F0E68C', lavender: '#E6E6FA', lavenderblush: '#FFF0F5', lawngreen: '#7CFC00', lemonchiffon: '#FFFACD', lightblue: '#ADD8E6', lightcoral: '#F08080', lightcyan: '#E0FFFF', lightgoldenrodyellow: '#FAFAD2', lightgray: '#D3D3D3', lightgrey: '#D3D3D3', lightgreen: '#90EE90', lightpink: '#FFB6C1', lightsalmon: '#FFA07A', lightseagreen: '#20B2AA', lightskyblue: '#87CEFA', lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#B0C4DE', lightyellow: '#FFFFE0', lime: '#00FF00', limegreen: '#32CD32', linen: '#FAF0E6', magenta: '#FF00FF', maroon: '#800000', mediumaquamarine: '#66CDAA', mediumblue: '#0000CD', mediumorchid: '#BA55D3', mediumpurple: '#9370DB', mediumseagreen: '#3CB371', mediumslateblue: '#7B68EE', mediumspringgreen: '#00FA9A', mediumturquoise: '#48D1CC', mediumvioletred: '#C71585', midnightblue: '#191970', mintcream: '#F5FFFA', mistyrose: '#FFE4E1', moccasin: '#FFE4B5', navajowhite: '#FFDEAD', navy: '#000080', oldlace: '#FDF5E6', olive: '#808000', olivedrab: '#6B8E23', orange: '#FFA500', orangered: '#FF4500', orchid: '#DA70D6', palegoldenrod: '#EEE8AA', palegreen: '#98FB98', paleturquoise: '#AFEEEE', palevioletred: '#DB7093', papayawhip: '#FFEFD5', peachpuff: '#FFDAB9', peru: '#CD853F', pink: '#FFC0CB', plum: '#DDA0DD', powderblue: '#B0E0E6', purple: '#800080', rebeccapurple: '#663399', red: '#FF0000', rosybrown: '#BC8F8F', royalblue: '#4169E1', saddlebrown: '#8B4513', salmon: '#FA8072', sandybrown: '#F4A460', seagreen: '#2E8B57', seashell: '#FFF5EE', sienna: '#A0522D', silver: '#C0C0C0', skyblue: '#87CEEB', slateblue: '#6A5ACD', slategray: '#708090', slategrey: '#708090', snow: '#FFFAFA', springgreen: '#00FF7F', steelblue: '#4682B4', tan: '#D2B48C', teal: '#008080', thistle: '#D8BFD8', tomato: '#FF6347', turquoise: '#40E0D0', violet: '#EE82EE', wheat: '#F5DEB3', white: '#FFFFFF', whitesmoke: '#F5F5F5', yellow: '#FFFF00', yellowgreen: '#9ACD32'
        };
        color = namedColors[color];
    }
    
    if (color === undefined){
        return false
    }
    
    //Now that we have hex, let's darken it
    //http://stackoverflow.com/a/13532993/2747370
    var R = parseInt(color.substring(1,3),16),
        G = parseInt(color.substring(3,5),16),
        B = parseInt(color.substring(5,7),16);

    R = parseInt(R * (1 + amt) );
    G = parseInt(G * (1 + amt) );
    B = parseInt(B * (1 + amt) );

    R = (R<255)?R:255;  
    G = (G<255)?G:255;  
    B = (B<255)?B:255;  

    var RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
    var GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
    var BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));

    return "#"+RR+GG+BB;
}

FreeBodyDraw.prototype.makeActiveStyle = function(vecStyle){    
    var copyOfVecStyle = $.extend(true,{},vecStyle); //Deep copy
    var activeStyle = this.settings.activeStyle
    
    copyOfVecStyle.color = this.lightenColor(copyOfVecStyle.color, activeStyle.lightness)
    copyOfVecStyle.width = activeStyle.widthMultiplier*copyOfVecStyle.width;
    return copyOfVecStyle;
}

FreeBodyDraw.prototype.styleVectorAsActive = function(vecIdx){
    var vecStyle = this.makeActiveStyle(this.settings.vectors[vecIdx].style);
    var jsxgVector = this.findJSXGVector(vecIdx);
    var jsxgLabelPoint = this.findJSXGVectorLabelPoint(vecIdx);
    
    jsxgVector.setAttribute({
        strokeWidth: vecStyle.width,
        strokeColor: vecStyle.color
    });
    jsxgLabelPoint.label.setAttribute({
        cssClass:"vec-label active",
        highlightCssClass:"vec-label active"
    });
}

FreeBodyDraw.prototype.styleVectorAsInactive = function(vecIdx){
    var originalStyle = this.settings.vectors[vecIdx].style;
    var jsxgVector = this.findJSXGVector(vecIdx);
    var jsxgLabelPoint = this.findJSXGVectorLabelPoint(vecIdx);
    
    jsxgVector.setAttribute({
        strokeWidth: originalStyle.width,
        strokeColor: originalStyle.color
    });
    jsxgLabelPoint.label.setAttribute({
        cssClass:"vec-label",
        highlightCssClass:"vec-label"
    });
}

FreeBodyDraw.prototype.updateDeleteStatus = function(){
    console.log("updateDeleteStatus")
    $('.delete-vector',this.element).addClass('inactive')
    if (this.isDrawn(this.currentActiveVectorIdx)){
        $('.delete-vector',this.element).removeClass('inactive')
    }
}

FreeBodyDraw.prototype.updateButtonsStatus = function(){
    console.log("updating buttons");
    var undoEmpty = this.history_stack.undo.length === 0,
    redoEmpty = this.history_stack.redo.length === 0;
    
    $('.reset', this.element).removeClass('inactive');
    $('.undo, .redo', this.element).addClass('inactive');
    if (!undoEmpty){
        $('.undo',this.element).removeClass('inactive');
    }
    if (!redoEmpty){
        $('.redo',this.element).removeClass('inactive');
    }
    this.updateDeleteStatus();
}

FreeBodyDraw.prototype.objectsUnderMouse = function(){
    var targetObjects = [];
    var highlightedObjects = this.board.highlightedObjects
    var keys = Object.keys(highlightedObjects);
    for (var i = 0; i < keys.length; i++) {
        targetObjects.push( highlightedObjects[keys[i]] );
    }
    return targetObjects
}

FreeBodyDraw.prototype.onBoardUp = function(evt){
    VectorDraw.prototype.onBoardUp.call(this,evt);
    this.updateButtonsStatus();
}

FreeBodyDraw.prototype.onKeyDown = function(evt){
    if (evt.which===8){ //Backspace key
        this.onDeleteDown();
    } 
}

FreeBodyDraw.prototype.getState = function(){
    var state = VectorDraw.prototype.getState.call(this);
    state.currentActiveVectorIdx = this.currentActiveVectorIdx;
    return state
}

FreeBodyDraw.prototype.setState = function(state){
    VectorDraw.prototype.setState.call(this,state);
    var activeVector = this.settings.vectors[state.currentActiveVectorIdx]
    this.updateDescriptionFromVector(activeVector)
    this.updateButtonsStatus();
}

FreeBodyDraw.prototype.getInput = function(){
    var input = this.getState();
    
    // Transform the expected_result setting into a list of checks.
    var vectors = this.settings.vectors;
    var expected_results = this.settings.expected_result;
    var checks = [];
    var undrawn_checks = [];

    //First, check unexpected vectors with presence:false
    _.each(vectors, function(vec, idx){
        if ( !expected_results.hasOwnProperty(vec.name) ){
            var absence_check = {
                vector:vec.name, 
                check:'presence',
                expected:false, 
                label:vec.style.label || vec.name,
                on: vec.on.long,
                from: vec.from.long,
                type: vec.forceType.long
            }
            checks.push(absence_check);
        }
    });
        
    //Now add other checks
    var drawnVectorNames = Object.keys(input.vectors);
    _.each(expected_results, function(answer, name) {
        var vecIdx = this.getNamedVectorIdx(name);
        var vec = vectors[vecIdx];
        var vecLabel = vec.style.label || name;
        var presence_check = {
            vector: name,
            check: 'presence',
            expected:true,
            label: vecLabel,
            on: vec.on.long,
            from: vec.from.long,
            type: vec.forceType.long
        };
        if ('presence' in answer) {
            presence_check.expected = answer.presence;
        }
        if ('presence_errmsg' in answer) {
            presence_check.errmsg = answer.presence_errmsg;
        }
        if (drawnVectorNames.length === 0){
            presence_check.errmsg = "Please select a force and begin drawing your free-body diagram."
        }
        if ( _.contains(drawnVectorNames, name) ){
            checks.push(presence_check);
        } else {
            undrawn_checks.push(presence_check);
        };

        [
            'min_length', 'tail', 'tail_x', 'tail_y', 'tip', 'tip_x', 'tip_y', 'coords',
            'length', 'angle', 'segment_angle', 'segment_coords', 'points_on_line'
        ].forEach(function(prop) {
            if (prop in answer) {
                var check = {
                    vector: name, 
                    check: prop,
                    expected: answer[prop],
                    label: vecLabel
                };
                if (prop + '_tolerance' in answer) {
                    check.tolerance = answer[prop + '_tolerance'];
                }
                if (prop + '_errmsg' in answer) {
                    check.errmsg = answer[prop + '_errmsg']
                }
                if ( _.contains(drawnVectorNames, name) ){
                    checks.push(check);
                } else {
                    undrawn_checks.push(check);
                };
            }
        });
    },this);

    input.checks = checks.concat(undrawn_checks).concat(this.settings.custom_checks);
    
    return input
}

/////////////////////////////////////////////////////

// var freebodydraw = new FreeBodyDraw('freebodydraw', freebodydraw_settings);
//
// var getState = function() {
//     var state = freebodydraw.getState();
//     return JSON.stringify(state);
// };
//
// var setState = function(serialized) {
//     freebodydraw.setState(JSON.parse(serialized));
// };
//
// var getInput = function() {
//     var input = freebodydraw.getInput();
//     return JSON.stringify(input);
// };
