def cfn_debugger(expect,answer):
    #Multi-input customresponse returns a list, singe-input return unicode
    #Make sure answer is a list
    if not isinstance(answer,list):
        answer = [answer,]
        
    #Now display each part of the list
    part_template = "Python sees: <pre><span style='font-size:16px'>{part}</span></pre>"
    input_list = [{"ok":True,"msg":part_template.format(part=part)} for part in answer]
    
    return {"overall_message":"Overall Message","input_list":input_list}