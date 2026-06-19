import urllib.request, json
BASE = 'http://localhost:19463/api'

def req(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(f'{BASE}{path}', data=body, method=method,
        headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            if not raw:
                return {'_empty': True, 'status': resp.status}
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return {'_err': e.code, 'msg': json.loads(raw)}
        except Exception:
            return {'_err': e.code, 'raw': raw.decode()}

print('=== 1. 提交直播计划 ===')
plan = req('POST', '/plans', {
    'title': '晚间新闻直播', 'location': '电视台大厦B厅',
    'start_time': '2026-06-20T19:00:00Z', 'end_time': '2026-06-20T20:00:00Z',
    'producer_id': 1, 'producer_name': '张制片', 'description': '晚间新闻'
})
print(json.dumps(plan, ensure_ascii=False))
plan_id = plan.get('id')

print('\n=== 2. 查询车辆和频率 ===')
vs = req('GET', '/vehicles')
print('车辆:', [(v['id'], v['code'], v['status']) for v in vs])
fs = req('GET', '/frequencies')
print('频率:', [(f['id'], f['code'], f['frequency']) for f in fs])

print('\n=== 3. 调度分配（车辆1 频率1） ===')
d1 = req('POST', '/dispatches', {
    'plan_id': plan_id, 'vehicle_id': vs[0]['id'], 'frequency_id': fs[0]['id'],
    'dispatcher_id': 3, 'dispatcher_name': '王调度', 'note': '标准配置'
})
print(json.dumps(d1, ensure_ascii=False))

print('\n=== 4. 相同频率冲突测试 ===')
plan2 = req('POST', '/plans', {
    'title': '冲突测试计划', 'location': '其他地点',
    'start_time': '2026-06-20T19:30:00Z', 'end_time': '2026-06-20T21:00:00Z',
    'producer_id': 2, 'producer_name': '李制片'
})
d_conflict = req('POST', '/dispatches', {
    'plan_id': plan2.get('id'), 'vehicle_id': vs[1]['id'], 'frequency_id': fs[0]['id'],
    'dispatcher_id': 3, 'dispatcher_name': '王调度'
})
print(json.dumps(d_conflict, ensure_ascii=False))

print('\n=== 5. 检修车辆冲突测试 ===')
maint_v = [v for v in vs if v['status'] == 'maintenance'][0]
d_maint = req('POST', '/dispatches', {
    'plan_id': plan2.get('id'), 'vehicle_id': maint_v['id'], 'frequency_id': fs[1]['id'],
    'dispatcher_id': 3, 'dispatcher_name': '王调度'
})
print(json.dumps(d_maint, ensure_ascii=False))

print('\n=== 6. 工程师操作：开始+回传+结束 ===')
req('POST', f'/plans/{plan_id}/start', {'engineer_id': 5, 'engineer_name': '陈工'})
s1 = req('POST', '/signals', {
    'plan_id': plan_id, 'engineer_id': 5, 'engineer_name': '陈工',
    'signal_strength': 95, 'signal_quality': 'good', 'notes': '信号良好'
})
print('信号记录:', json.dumps(s1, ensure_ascii=False))
req('POST', f'/plans/{plan_id}/end', {'engineer_id': 5, 'engineer_name': '陈工'})

print('\n=== 7. 信号记录不可撤回测试 ===')
del_result = req('DELETE', f'/signals/{s1["id"]}')
print(json.dumps(del_result, ensure_ascii=False))

print('\n=== 8. 最终仪表板统计 ===')
print(json.dumps(req('GET', '/dashboard/summary'), ensure_ascii=False))
