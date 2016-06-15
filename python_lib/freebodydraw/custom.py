def check_min_length(check, vectors):
    vec = vectors[check['vector']]
    errmsg = "Vector {name} is so short it's hard for us to understand. Please make {name} longer."
    if vec.length < check['expected']:
        return errmsg.format(name=check['vector'])

def check_sum_x(check, vectors):
    total = 0
    vec_list = check['vectors']
    coeff_list = check['coeffs']
    for vec_name, coeff in zip(vec_list,coeff_list):
        vec = vectors[vec_name]
        vec_x = vec.tip.x - vec.tail.x
        total += vec_x*coeff
    expected = check['expected']
    tolerance = check.get('tolerance', 1.0)
    errmsg = check.get('errmsg','Error')
    if abs(total-expected) > tolerance:
        return errmsg

def check_sum_y(check, vectors):
    total = 0
    vec_list = check['vectors']
    coeff_list = check['coeffs']
    for vec_name, coeff in zip(vec_list,coeff_list):
        vec = vectors[vec_name]
        vec_y = vec.tip.y - vec.tail.y
        total += vec_y*coeff
    expected = check['expected']
    tolerance = check.get('tolerance', 1.0)
    errmsg = check.get('errmsg','Error')
    if abs(total-expected) > tolerance:
        return errmsg