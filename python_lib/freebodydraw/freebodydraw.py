# Please recreate pyton_lib.zip after you modify this file:
#   zip python_lib.zip vectordraw.py

###################
### Python API ####
###################

import inspect
import json
import math


## Built-in check functions

def _errmsg(default_message, check, vectors):
    template = check.get('errmsg', default_message)
    vec = vectors[check['vector']]
    return template.format(name=vec.name,
                           label = check['label'],
                           forceOn = check['on'],
                           forceFrom = check['from'],
                           forceType = check['type'],
                           tail_x=vec.tail.x,
                           tail_y=vec.tail.y,
                           tip_x=vec.tip.x,
                           tip_y=vec.tip.y,
                           length=vec.length,
                           angle=vec.angle)

def _errmsg_point(default_message, check, point):
    template = check.get('errmsg', default_message)
    return template.format(name=check['point'], x=point.x, y=point.y)

def check_presence(check, vectors):
    if check['vector'] not in vectors and check['expected']:
        # errmsg = check.get('errmsg', 'You need to use the {label} vector.')
        errmsg = check.get('errmsg', "What you've drawn so far is correct, but you're missing some force(s) acting on {forceOn}.")
        return errmsg.format(label=check['label'],forceOn=check['on'])
    if check['vector'] in vectors and not check['expected']:
        forceOn=check['on']
        forceType = check['type']
        forceFrom = check['from']
        label = check['label']
        if forceType.lower() == 'gravitational':
            errmsg = check.get('errmsg', "The gravitational attraction between {forceFrom} and {forceOn} is negligible in comparison to other forces in this problem. Let's agree not to include the force {label}.")
        else:
            errmsg = check.get('errmsg', "{forceFrom} does not exert a {forceType} force on {forceOn}. We should not include force {label}.")
        return errmsg.format(label=label,forceOn=forceOn,forceFrom=forceFrom,forceType=forceType)
def check_min_length(check, vectors):
    vec = vectors[check['vector']]
    if vec.length < check['expected']:
        return _errmsg("Vector {label} is so short it's hard for us to understand. Please make {label} longer. (Your {label} length: {length:.1f})", check, vectors)
def check_tail(check, vectors):
    vec = vectors[check['vector']]
    tolerance = check.get('tolerance', 4.0)
    expected = check['expected']
    dist = math.hypot(expected[0] - vec.tail.x, expected[1] - vec.tail.y)
    if dist > tolerance:
        return _errmsg('Vector {label} does not start at correct point.', check, vectors)

def check_tip(check, vectors):
    vec = vectors[check['vector']]
    tolerance = check.get('tolerance', 4.0)
    expected = check['expected']
    dist = math.hypot(expected[0] - vec.tip.x, expected[1] - vec.tip.y)
    if dist > tolerance:
        return _errmsg('Vector {label} does not end at correct point.', check, vectors)

def _check_coordinate(check, coord):
    tolerance = check.get('tolerance', 1.0)
    expected = check['expected']
    return abs(expected - coord) > tolerance

def check_tail_x(check, vectors):
    vec = vectors[check['vector']]
    if _check_coordinate(check, vec.tail.x):
        return _errmsg('Vector {label} does not start at correct point.', check, vectors)

def check_tail_y(check, vectors):
    vec = vectors[check['vector']]
    if _check_coordinate(check, vec.tail.y):
        return _errmsg('Vector {label} does not start at correct point.', check, vectors)

def check_tip_x(check, vectors):
    vec = vectors[check['vector']]
    if _check_coordinate(check, vec.tip.x):
        return _errmsg('Vector {label} does not end at correct point.', check, vectors)

def check_tip_y(check, vectors):
    vec = vectors[check['vector']]
    if _check_coordinate(check, vec.tip.y):
        return _errmsg('Vector {label} does not end at correct point.', check, vectors)

def _coord_delta(expected, actual):
    if expected == '_':
        return 0
    else:
        return expected - actual

def _coords_within_tolerance(vec, expected, tolerance):
    for expected_coords, vec_coords in ([expected[0], vec.tail], [expected[1], vec.tip]):
        delta_x = _coord_delta(expected_coords[0], vec_coords.x)
        delta_y = _coord_delta(expected_coords[1], vec_coords.y)
        if math.hypot(delta_x, delta_y) > tolerance:
            return False
    return True

def check_coords(check, vectors):
    vec = vectors[check['vector']]
    expected = check['expected']
    tolerance = check.get('tolerance', 1.0)
    if not _coords_within_tolerance(vec, expected, tolerance):
        return _errmsg('Vector {label} coordinates are not correct.', check, vectors)

def check_segment_coords(check, vectors):
    vec = vectors[check['vector']]
    expected = check['expected']
    tolerance = check.get('tolerance', 1.0)
    if not (_coords_within_tolerance(vec, expected, tolerance) or
            _coords_within_tolerance(vec.opposite(), expected, tolerance)):
        return _errmsg('Segment {label} coordinates are not correct.', check, vectors)

def check_length(check, vectors):
    vec = vectors[check['vector']]
    tolerance = check.get('tolerance', 1.0)
    if abs(vec.length - check['expected']) > tolerance:
        return _errmsg('The length of {label} is incorrect. Your length: {length:.1f}', check, vectors)

def _angle_within_tolerance(vec, expected, tolerance):
    # Calculate angle between vec and identity vector with expected angle
    # using the formula:
    # angle = acos((A . B) / len(A)*len(B))
    x = vec.tip.x - vec.tail.x
    y = vec.tip.y - vec.tail.y
    dot_product = x * math.cos(expected) + y * math.sin(expected)
    angle = math.degrees(math.acos(dot_product / vec.length))
    return abs(angle) <= tolerance

def check_angle(check, vectors):
    vec = vectors[check['vector']]
    tolerance = check.get('tolerance', 4.0)
    expected = math.radians(check['expected'])
    angle_ok = _angle_within_tolerance(vec, expected, tolerance)
    angle_opposite = _angle_within_tolerance(vec, expected+math.pi, tolerance)
    is_normal_force = "normal" in check['type'].lower()
    is_friction = "friction" in check['type'].lower()
    is_kinetic_friction_force = "kinetic" in check['type'].lower()
    is_static_friction_force = "static" in check['type'].lower()
    if angle_ok:
        return None
    elif is_normal_force and not angle_ok and not angle_opposite:
        return _errmsg('The normal force {label} you drew does not have the correct direction. <br><br> Reminder:  normal forces always act perpendicular ("normal") to the surfaces of the interacting objects.', check, vectors)
    elif is_friction and not angle_ok and not angle_opposite:
        return _errmsg('The normal force {label} you drew does not have the correct direction. <br><br> Reminder:  friction forces always act parallel to the surfaces of the interacting objects.', check, vectors)
    elif is_kinetic_friction_force and not angle_ok:
        return _errmsg('The kinetic friction force {label} you drew does not have the correct direction. <br><br> Reminder: a kinetic friction force on {forceOn} from {forceFrom} always acts to <strong>opposite the relative motion</strong> of these objects.', check, vectors)
    elif is_static_friction_force and not angle_ok:
        return _errmsg('The static friction force {label} you drew does not have the correct direction. <br><br> Reminder: static friction acts to <strong>prevent relative motion</strong>. What direction does {label} need to point in order to prevent relation motion between {forceOn} and {forceFrom}?', check, vectors)
    else:
        return _errmsg('The direction of force {label} is incorrect.', check, vectors)

def check_angle_not(check,vectors):
    vec = vectors[check['vector']]
    tolerance = check.get('tolerance', 4.0)
    expected = math.radians(check['expected'])
    if _angle_within_tolerance(vec, expected, tolerance):
        return _errmsg('The force {label} should not have angle {angle}', check, vectors)

def check_segment_angle(check, vectors):
    # Segments are not directed, so we must check the angle between the segment and
    # the vector that represents it, as well as its opposite vector.
    vec = vectors[check['vector']]
    tolerance = check.get('tolerance', 2.0)
    expected = math.radians(check['expected'])
    if not (_angle_within_tolerance(vec, expected, tolerance) or
            _angle_within_tolerance(vec.opposite(), expected, tolerance)):
        return _errmsg('The angle of {label} is incorrect. Your angle: {angle:.1f}', check, vectors)

def _dist_line_point(line, point):
    # Return the distance between the given line and point.  The line is passed in as a Vector
    # instance, the point as a Point instance.
    direction_x = line.tip.x - line.tail.x
    direction_y = line.tip.y - line.tail.y
    determinant = (point.x - line.tail.x) * direction_y - (point.y - line.tail.y) * direction_x
    return abs(determinant) / math.hypot(direction_x, direction_y)

def check_points_on_line(check, vectors):
    line = vectors[check['vector']]
    tolerance = check.get('tolerance', 1.0)
    points = check.get('expected')
    for point in points:
        point = Point(point[0], point[1])
        if _dist_line_point(line, point) > tolerance:
            return _errmsg('The line {name} does not pass through the correct points.', check, vectors)

def check_point_coords(check, points):
    point = points[check['point']]
    tolerance = check.get('tolerance', 1.0)
    expected = check.get('expected')
    dist = math.hypot(expected[0] - point.x, expected[1] - point.y)
    if dist > tolerance:
        return _errmsg_point('Point {name} is not at the correct location.', check, point)

class Point(object):
    def __init__(self, x, y):
        self.x = x
        self.y = y

class Vector(object):
    def __init__(self, name, x1, y1, x2, y2):
        self.name = name
        self.tail = Point(x1, y1)
        self.tip = Point(x2, y2)
        self.length = math.hypot(x2 - x1, y2 - y1)
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
        if angle < 0:
            angle += 360
        self.angle = angle

    def opposite(self):
        return Vector(self.name, self.tip.x, self.tip.y, self.tail.x, self.tail.y)

class Grader(object):
    check_registry = {
        'presence': check_presence,
        'min_length':check_min_length,
        'tail': check_tail,
        'tip': check_tip,
        'tail_x': check_tail_x,
        'tail_y': check_tail_y,
        'tip_x': check_tip_x,
        'tip_y': check_tip_y,
        'coords': check_coords,
        'length': check_length,
        'angle_not': check_angle_not,
        'angle': check_angle,
        'segment_angle': check_segment_angle,
        'segment_coords': check_segment_coords,
        'points_on_line': check_points_on_line,
        'point_coords': check_point_coords,
    }

    def __init__(self, success_message="Your free-body diagram seems correct!. Still, we recommend you compare your drawing to the solution.", custom_checks=None):
        self.success_message = success_message
        if custom_checks:
            self.check_registry.update(custom_checks)

    def grade(self, answer):
        check_data = dict(
            vectors=self._get_vectors(answer),
            points=self._get_points(answer),
        )
        for check in answer['checks']:
            check_data['check'] = check
            check_fn = self.check_registry[check['check']]
            args = [check_data[arg] for arg in inspect.getargspec(check_fn).args]
            result = check_fn(*args)
            if result:
                ok = False
                grade_decimal = 0
                if 'so far is correct' in result:
                    ok = 'Partial'
                return {'ok': ok, 'msg': result, 'grade_decimal':grade_decimal}
        return {'ok': True, 'msg': self.success_message}

    def cfn(self, e, ans):
        answer = json.loads(json.loads(ans)['answer'])
        return self.grade(answer)

    def _get_vectors(self, answer):
        vectors = {}
        for name, props in answer['vectors'].iteritems():
            tail = props['tail']
            tip = props['tip']
            vectors[name] = Vector(name, tail[0], tail[1], tip[0], tip[1])
        return vectors

    def _get_points(self, answer):
        return {name: Point(*coords) for name, coords in answer['points'].iteritems()}