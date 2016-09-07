import python_lib.freebodydraw as freebodydraw

answer0 = [
    {'name': 'N_box_wall', 'comps': [-2,0]}
    ]
answer1 = [
    {'name': 'N_box_wall', 'comps': [-4,0]}
    ]
    
query = "?answer0={answer0}&answer1={answer1}".format(
    answer0=freebodydraw.encoded_answer(answer0),
    answer1=freebodydraw.encoded_answer(answer1)
)

print(query)