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


passed = 0
failed = 0

def check(cond, desc, detail=''):
    global passed, failed
    if cond:
        passed += 1
        print(f'✅ PASS: {desc}')
    else:
        failed += 1
        print(f'❌ FAIL: {desc} | {detail}')


print('=' * 60)
print('【重叠检修排期拦截回归测试】')
print('=' * 60)

# =======================================================
# 准备阶段：取一个可用车辆（非检修中）
# =======================================================
print('\n--- 准备数据 ---')
vs = req('GET', '/vehicles')
avail_vehicles = [v for v in vs if v['status'] != 'maintenance']
veh = avail_vehicles[0]
print(f'选择测试车辆: id={veh["id"]} type={type(veh["id"]).__name__} code={veh["code"]} status={veh["status"]}')

fs = req('GET', '/frequencies')
freq = fs[0]
print(f'选择测试频率: id={freq["id"]} type={type(freq["id"]).__name__} code={freq["code"]}')

dispatcher_id = 3
dispatcher_name = '王调度'

# =======================================================
# 场景1: 检修计划完全包含直播时段 → 必须拦截
# =======================================================
print('\n=== 场景1: 检修计划完全包含直播时段 ===')

# 创建检修计划（覆盖 10:00-14:00）
maint1 = req('POST', f'/vehicles/{veh["id"]}/maintenance', {
    'start_time': '2026-06-22T10:00:00Z',
    'end_time': '2026-06-22T14:00:00Z',
    'reason': '年检'
})
print(f'检修计划: {json.dumps(maint1, ensure_ascii=False)}')

# 创建直播计划（11:00-13:00，被检修完全包含）
plan1 = req('POST', '/plans', {
    'title': '场景1-被检修包含',
    'location': 'A厅',
    'start_time': '2026-06-22T11:00:00Z',
    'end_time': '2026-06-22T13:00:00Z',
    'producer_id': 1, 'producer_name': '张制片',
    'description': '检修完全包含直播时段'
})
plan1_id = plan1.get('id')
print(f'直播计划: id={plan1_id} status={plan1.get("status")}')

# 尝试调度：应该被拦截，错误码 VEHICLE_MAINTENANCE_SCHEDULED
d1 = req('POST', '/dispatches', {
    'plan_id': plan1_id,
    'vehicle_id': veh['id'],  # 相同类型（number）
    'frequency_id': freq['id'],
    'dispatcher_id': dispatcher_id,
    'dispatcher_name': dispatcher_name
})
print(f'调度结果: {json.dumps(d1, ensure_ascii=False)}')

check(
    d1.get('_err') == 400 and d1.get('msg', {}).get('code') == 'VEHICLE_MAINTENANCE_SCHEDULED',
    '场景1: 检修完全包含直播时段应返回 VEHICLE_MAINTENANCE_SCHEDULED',
    f'实际: code={d1.get("msg", {}).get("code")}'
)

# 验证计划状态仍是 pending，没有变为 dispatched
plan1_check = req('GET', f'/plans/{plan1_id}')
check(
    plan1_check.get('status') == 'pending',
    '场景1: 拦截后计划状态仍为 pending，不应变为 dispatched',
    f'实际状态: {plan1_check.get("status")}'
)

# =======================================================
# 场景2: 检修计划与直播时段部分重叠 → 必须拦截
# =======================================================
print('\n=== 场景2: 检修计划与直播时段部分重叠 ===')

# 先创建一个与场景2直播时段重叠的检修计划：2026-06-23 10:30-12:30
maint2 = req('POST', f'/vehicles/{veh["id"]}/maintenance', {
    'start_time': '2026-06-23T10:30:00Z',
    'end_time': '2026-06-23T12:30:00Z',
    'reason': '天线校准'
})
print(f'新增检修计划(与场景2重叠): {json.dumps(maint2, ensure_ascii=False)}')

# 直播：09:00-11:30，检修：10:30-12:30 → 重叠 10:30-11:30
plan2 = req('POST', '/plans', {
    'title': '场景2-部分重叠',
    'location': 'B厅',
    'start_time': '2026-06-23T09:00:00Z',
    'end_time': '2026-06-23T11:30:00Z',
    'producer_id': 1, 'producer_name': '张制片',
    'description': '检修与直播部分重叠'
})
plan2_id = plan2.get('id')

# 注意：vehicle_id 用字符串类型，模拟前端传字符串的场景
d2 = req('POST', '/dispatches', {
    'plan_id': plan2_id,
    'vehicle_id': str(veh['id']),  # 字符串类型！测试类型不一致时仍能拦截
    'frequency_id': freq['id'],
    'dispatcher_id': dispatcher_id,
    'dispatcher_name': dispatcher_name
})
print(f'调度结果: {json.dumps(d2, ensure_ascii=False)}')

check(
    d2.get('_err') == 400 and d2.get('msg', {}).get('code') == 'VEHICLE_MAINTENANCE_SCHEDULED',
    '场景2: vehicle_id 为字符串、检修与直播部分重叠仍应被拦截',
    f'实际: err={d2.get("_err")} code={d2.get("msg", {}).get("code")}'
)

plan2_check = req('GET', f'/plans/{plan2_id}')
check(
    plan2_check.get('status') == 'pending',
    '场景2: 拦截后计划状态仍为 pending',
    f'实际状态: {plan2_check.get("status")}'
)

# =======================================================
# 场景3: 检修时段与直播时段相邻不重叠（直播刚结束检修开始）→ 允许调度
# =======================================================
print('\n=== 场景3: 检修与直播相邻不重叠（直播结束=检修开始） ===')

plan3 = req('POST', '/plans', {
    'title': '场景3-相邻不重叠',
    'location': 'C厅',
    'start_time': '2026-06-24T08:00:00Z',
    'end_time': '2026-06-24T10:00:00Z',
    'producer_id': 1, 'producer_name': '张制片',
    'description': '直播结束时检修开始（相邻，不重叠）'
})
plan3_id = plan3.get('id')

# 检修从 10:00 开始，直播 10:00 结束 → end_time == start_time 不算重叠
d3 = req('POST', '/dispatches', {
    'plan_id': plan3_id,
    'vehicle_id': veh['id'],
    'frequency_id': freq['id'],
    'dispatcher_id': dispatcher_id,
    'dispatcher_name': dispatcher_name
})
print(f'调度结果: {json.dumps(d3, ensure_ascii=False)}')

check(
    d3.get('_err') is None and d3.get('plan_id') == plan3_id,
    '场景3: 检修与直播相邻不重叠（端点相接）应允许调度',
    f'实际: err={d3.get("_err")} plan_id={d3.get("plan_id")}'
)

plan3_check = req('GET', f'/plans/{plan3_id}')
check(
    plan3_check.get('status') == 'dispatched',
    '场景3: 调度成功后计划状态变为 dispatched',
    f'实际状态: {plan3_check.get("status")}'
)

# =======================================================
# 场景4: vehicle_id 类型不一致但实际检修中（status=maintenance）→ 拦截
# =======================================================
print('\n=== 场景4: vehicle_id 类型不一致但车辆本身在检修中 ===')

maint_vehicles = [v for v in vs if v['status'] == 'maintenance']
if maint_vehicles:
    maint_v = maint_vehicles[0]
    plan4 = req('POST', '/plans', {
        'title': '场景4-检修中车辆',
        'location': 'D厅',
        'start_time': '2026-06-25T09:00:00Z',
        'end_time': '2026-06-25T10:00:00Z',
        'producer_id': 1, 'producer_name': '张制片'
    })
    plan4_id = plan4.get('id')

    # 故意用字符串类型的 vehicle_id
    d4 = req('POST', '/dispatches', {
        'plan_id': plan4_id,
        'vehicle_id': str(maint_v['id']),  # 字符串类型
        'frequency_id': freq['id'],
        'dispatcher_id': dispatcher_id,
        'dispatcher_name': dispatcher_name
    })
    print(f'调度结果: {json.dumps(d4, ensure_ascii=False)}')

    check(
        d4.get('_err') == 400 and d4.get('msg', {}).get('code') == 'VEHICLE_MAINTENANCE',
        '场景4: vehicle_id 为字符串但车辆本身 status=maintenance 应被拦截',
        f'实际: err={d4.get("_err")} code={d4.get("msg", {}).get("code")}'
    )

    plan4_check = req('GET', f'/plans/{plan4_id}')
    check(
        plan4_check.get('status') == 'pending',
        '场景4: 拦截后计划状态仍为 pending',
        f'实际状态: {plan4_check.get("status")}'
    )
else:
    print('⚠️  跳过: 无检修中车辆可供测试')

# =======================================================
# 场景5: 车辆可用性 API（GET availability）返回 conflict_maintenance
# =======================================================
print('\n=== 场景5: 车辆可用性 API 检修冲突识别 ===')

avail = req('GET', f'/vehicles/{veh["id"]}/availability?start_time=2026-06-22T11:00:00Z&end_time=2026-06-22T13:00:00Z')
print(f'可用性结果: {json.dumps(avail, ensure_ascii=False)}')

check(
    avail.get('available') is False and len(avail.get('conflict_maintenance', [])) > 0,
    '场景5: 车辆可用性 API 正确识别检修冲突（available=false，conflict_maintenance 非空）',
    f'available={avail.get("available")} conflict_maintenance={avail.get("conflict_maintenance")}'
)

# 用字符串 id 再测一次（模拟前端传 string）
avail_str = req('GET', f'/vehicles/{str(veh["id"])}/availability?start_time=2026-06-22T11:00:00Z&end_time=2026-06-22T13:00:00Z')
check(
    avail_str.get('available') is False and len(avail_str.get('conflict_maintenance', [])) > 0,
    '场景5b: 字符串 id 时可用性 API 仍能正确识别检修冲突',
    f'available={avail_str.get("available")}'
)

# =======================================================
# 汇总
# =======================================================
print('\n' + '=' * 60)
print(f'测试完成: ✅ 通过 {passed} 项, ❌ 失败 {failed} 项')
print('=' * 60)

if failed > 0:
    exit(1)
