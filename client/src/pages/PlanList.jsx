import React, { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Button, Space, Modal, Form, Select, Input, DatePicker,
  message, Popconfirm, Drawer, Descriptions, Divider, List, Spin, Badge,
  Alert, Row, Col, Typography
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, SendOutlined, EyeOutlined, DeleteOutlined,
  ThunderboltOutlined, SwapOutlined, EditOutlined
} from '@ant-design/icons';
import { plansApi, dispatchesApi, vehiclesApi, frequenciesApi, signalsApi, frequencySwitchApi } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;
const { Text, Paragraph } = Typography;

const statusMap = {
  pending: { text: '待调度', color: 'orange' },
  dispatched: { text: '已调度', color: 'blue' },
  ongoing: { text: '进行中', color: 'green' },
  ended: { text: '已结束', color: 'default' },
  cancelled: { text: '已取消', color: 'red' }
};

const signalQualityMap = {
  excellent: { text: '优秀', color: 'green' },
  good: { text: '良好', color: 'blue' },
  fair: { text: '一般', color: 'orange' },
  poor: { text: '较差', color: 'red' }
};

const switchReasonMap = {
  signal_abnormal: { text: '信号异常', color: 'orange' },
  interference: { text: '信号干扰', color: 'orange' },
  backup_test: { text: '备用测试', color: 'blue' },
  quality_improve: { text: '质量提升', color: 'green' },
  other: { text: '其他原因', color: 'default' }
};

function PlanList() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispatchModal, setDispatchModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [dispatchForm] = Form.useForm();
  const [vehicles, setVehicles] = useState([]);
  const [frequencies, setFrequencies] = useState([]);
  const [checkingVehicle, setCheckingVehicle] = useState(null);
  const [checkingFreq, setCheckingFreq] = useState(null);
  const [vehicleAvailable, setVehicleAvailable] = useState(null);
  const [freqAvailable, setFreqAvailable] = useState(null);
  const [detailDrawer, setDetailDrawer] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [switchModal, setSwitchModal] = useState(false);
  const [switchForm] = Form.useForm();
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewForm] = Form.useForm();
  const [availableBackupFreqs, setAvailableBackupFreqs] = useState([]);
  const [checkingBackupFreq, setCheckingBackupFreq] = useState(null);
  const { currentUser } = useApp();
  const isProducer = currentUser?.role === 'producer';
  const isDispatcher = currentUser?.role === 'dispatcher';
  const isEngineer = currentUser?.role === 'engineer';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [planList, vList, fList] = await Promise.all([
        plansApi.list(),
        vehiclesApi.list(),
        frequenciesApi.list()
      ]);
      setPlans(planList);
      setVehicles(vList.filter(v => v.status !== 'maintenance'));
      setFrequencies(fList);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openDispatch = (plan) => {
    setSelectedPlan(plan);
    setVehicleAvailable(null);
    setFreqAvailable(null);
    dispatchForm.resetFields();
    setDispatchModal(true);
  };

  const checkVehicle = async (vehicleId) => {
    if (!vehicleId || !selectedPlan) return;
    try {
      setCheckingVehicle(vehicleId);
      const result = await vehiclesApi.checkAvailability(vehicleId, {
        start_time: selectedPlan.start_time,
        end_time: selectedPlan.end_time
      });
      setVehicleAvailable(result);
    } catch (e) {
      message.error(e.message);
    } finally {
      setCheckingVehicle(null);
    }
  };

  const checkFrequency = async (freqId) => {
    if (!freqId || !selectedPlan) return;
    try {
      setCheckingFreq(freqId);
      const result = await frequenciesApi.checkAvailability(freqId, {
        start_time: selectedPlan.start_time,
        end_time: selectedPlan.end_time,
        exclude_plan_id: selectedPlan.id
      });
      setFreqAvailable(result);
    } catch (e) {
      message.error(e.message);
    } finally {
      setCheckingFreq(null);
    }
  };

  const handleDispatch = async () => {
    try {
      const values = await dispatchForm.validateFields();
      if (vehicleAvailable && vehicleAvailable.available === false) {
        const reasons = [];
        if (vehicleAvailable.conflict_plans?.length > 0) reasons.push('车辆该时段已有排期');
        if (vehicleAvailable.conflict_maintenance?.length > 0) reasons.push('车辆该时段有检修安排');
        if (vehicleAvailable.vehicle_status === 'maintenance') reasons.push('车辆正在检修中');
        Modal.error({
          title: '无法下发调度',
          content: (
            <div>
              <p>所选车辆此时段不可用，调度下发被阻止：</p>
              <ul>
                {reasons.map((r, i) => <li key={i} style={{ color: '#d4380d' }}>{r}</li>)}
              </ul>
              <p style={{ marginTop: 8, fontSize: 12, color: '#888' }}>请更换车辆或调整直播时段后再试。</p>
            </div>
          ),
          okText: '我知道了'
        });
        return;
      }
      if (freqAvailable && freqAvailable.available === false) {
        Modal.error({
          title: '无法下发调度',
          content: (
            <div>
              <p>所选频率此时段已被占用，调度下发被阻止。</p>
              {freqAvailable.conflicts?.length > 0 && (
                <p style={{ color: '#d4380d' }}>
                  冲突：{freqAvailable.conflicts.map(p => `${p.title}(${p.vehicle_code || '未分配'})`).join(', ')}
                </p>
              )}
              <p style={{ marginTop: 8, fontSize: 12, color: '#888' }}>请更换频率后再试。</p>
            </div>
          ),
          okText: '我知道了'
        });
        return;
      }
      await dispatchesApi.create({
        plan_id: selectedPlan.id,
        vehicle_id: values.vehicle_id,
        frequency_id: values.frequency_id,
        dispatcher_id: currentUser.id,
        dispatcher_name: currentUser.name,
        note: values.note
      });
      message.success('调度成功，频率和车辆已分配');
      setDispatchModal(false);
      loadData();
    } catch (e) {
      const errorMsg = e.message;
      if (errorMsg.includes('同城市') || errorMsg.includes('SAME_CITY')) {
        Modal.error({
          title: '同城频率冲突',
          content: (
            <div>
              <Alert
                type="error"
                showIcon
                message="频率冲突不能下发"
                description={errorMsg}
                style={{ marginBottom: 12 }}
              />
              <p style={{ fontSize: 12, color: '#888' }}>
                同一城市同一时段不能使用相同频率。请更换频率或协调其他直播的频率使用。
              </p>
            </div>
          ),
          okText: '我知道了'
        });
      } else if (errorMsg.includes('检修') || errorMsg.includes('MAINTENANCE')) {
        Modal.error({
          title: '车辆检修中',
          content: (
            <div>
              <Alert
                type="error"
                showIcon
                message="直播车检修中不能排期"
                description={errorMsg}
              />
            </div>
          ),
          okText: '我知道了'
        });
      } else {
        message.error(errorMsg);
      }
    }
  };

  const openSwitchFrequency = (plan) => {
    setSelectedPlan(plan);
    setAvailableBackupFreqs([]);
    switchForm.resetFields();
    loadBackupFrequencies(plan);
    setSwitchModal(true);
  };

  const loadBackupFrequencies = async (plan) => {
    try {
      setCheckingBackupFreq(true);
      const allFreqs = await frequenciesApi.list();
      const backupFreqs = allFreqs.filter(f => f.is_backup);
      const available = [];
      for (const freq of backupFreqs) {
        try {
          const result = await frequenciesApi.checkAvailability(freq.id, {
            start_time: plan.start_time,
            end_time: plan.end_time,
            exclude_plan_id: plan.id
          });
          if (result.available) {
            available.push({ ...freq, available: true });
          } else {
            available.push({ ...freq, available: false, conflicts: result.conflicts });
          }
        } catch (e) {
          available.push({ ...freq, available: false, error: e.message });
        }
      }
      setAvailableBackupFreqs(available);
    } catch (e) {
      message.error(e.message);
    } finally {
      setCheckingBackupFreq(false);
    }
  };

  const handleSwitchFrequency = async () => {
    try {
      const values = await switchForm.validateFields();
      if (!selectedPlan || !selectedPlan.frequency_id) {
        message.error('当前计划没有分配频率，无法切换');
        return;
      }
      await frequencySwitchApi.create({
        plan_id: selectedPlan.id,
        old_frequency_id: selectedPlan.frequency_id,
        new_frequency_id: values.new_frequency_id,
        engineer_id: currentUser.id,
        engineer_name: currentUser.name,
        reason: values.reason,
        note: values.note
      });
      message.success('频率已切换到备用频率，原频率占用记录已保留');
      setSwitchModal(false);
      loadData();
      if (detailDrawer) {
        const detail = await plansApi.get(selectedPlan.id);
        setDetailData(detail);
      }
    } catch (e) {
      message.error(e.message);
    }
  };

  const openReview = (plan) => {
    setSelectedPlan(plan);
    reviewForm.resetFields();
    setReviewModal(true);
  };

  const handleReview = async () => {
    try {
      const values = await reviewForm.validateFields();
      await plansApi.addReview(selectedPlan.id, {
        review_notes: values.review_notes,
        fault_reason: values.fault_reason,
        operator_id: currentUser.id,
        operator_name: currentUser.name
      });
      message.success('复盘和故障原因已追加');
      setReviewModal(false);
      loadData();
      if (detailDrawer) {
        const detail = await plansApi.get(selectedPlan.id);
        setDetailData(detail);
      }
    } catch (e) {
      message.error(e.message);
    }
  };

  const createTemporary = () => {
    window.location.hash = '#/plan/create?temporary=1';
  };

  const handleCancel = async (plan) => {
    try {
      if (plan.dispatch_id) {
        await dispatchesApi.cancel(plan.id);
      } else {
        await plansApi.cancel(plan.id);
      }
      message.success('计划已取消');
      loadData();
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleStart = async (plan) => {
    try {
      await plansApi.start(plan.id);
      message.success('直播已开始');
      loadData();
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleEnd = async (plan) => {
    try {
      await plansApi.end(plan.id);
      message.success('直播已结束');
      loadData();
    } catch (e) {
      message.error(e.message);
    }
  };

  const showDetail = async (plan) => {
    try {
      const data = await plansApi.get(plan.id);
      setDetailData(data);
      setDetailDrawer(true);
    } catch (e) {
      message.error(e.message);
    }
  };

  const columns = [
    {
      title: '时间',
      key: 'time',
      width: 180,
      render: (_, r) => (
        <div>
          <div>{dayjs(r.start_time).format('MM-DD HH:mm')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>至 {dayjs(r.end_time).format('MM-DD HH:mm')}</div>
        </div>
      )
    },
    {
      title: '类型',
      key: 'type',
      width: 80,
      render: (_, r) => (
        <Space>
          {r.is_temporary ? (
            <Tag color="red" icon={<ThunderboltOutlined />}>临时</Tag>
          ) : (
            <Tag color="blue">常规</Tag>
          )}
          {r.frequency_switched && (
            <Tag color="orange" icon={<SwapOutlined />}>已切换</Tag>
          )}
        </Space>
      )
    },
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '城市', dataIndex: 'city', key: 'city', width: 80, render: c => c || '-' },
    { title: '地点', dataIndex: 'location', key: 'location', width: 120 },
    { title: '制片', dataIndex: 'producer_name', key: 'producer', width: 90 },
    {
      title: '转播车',
      key: 'vehicle',
      width: 140,
      render: (_, r) => r.vehicle_code ? (
        <Space>
          <Tag color="blue">{r.vehicle_code}</Tag>
          <span style={{ fontSize: 12 }}>{r.vehicle_name}</span>
        </Space>
      ) : <span style={{ color: '#999' }}>未分配</span>
    },
    {
      title: '频率',
      key: 'frequency',
      width: 170,
      render: (_, r) => r.frequency_code ? (
        <Space direction="vertical" size={0}>
          <Tag color="purple">
            📡 {r.frequency_code} {r.frequency}MHz
          </Tag>
          {r.frequency_switched && (
            <span style={{ fontSize: 11, color: '#fa8c16' }}>已切换备用</span>
          )}
        </Space>
      ) : <span style={{ color: '#999' }}>未分配</span>
    },
    {
      title: '信号质量',
      key: 'signal',
      width: 100,
      render: (_, r) => r.signal_quality ? (
        <Tag color={signalQualityMap[r.signal_quality].color}>
          {signalQualityMap[r.signal_quality].text}
        </Tag>
      ) : '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s) => <Tag color={statusMap[s].color}>{statusMap[s].text}</Tag>
    },
    {
      title: '操作',
      key: 'action',
      width: 380,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small" wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(r)}>详情</Button>
          {r.status === 'pending' && isDispatcher && (
            <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => openDispatch(r)}>
              调度
            </Button>
          )}
          {(r.status === 'ongoing' || r.status === 'dispatched') && isEngineer && r.frequency_id && (
            <Button
              size="small"
              icon={<SwapOutlined />}
              onClick={() => openSwitchFrequency(r)}
            >
              切换频率
            </Button>
          )}
          {r.status === 'ended' && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openReview(r)}
            >
              追加复盘
            </Button>
          )}
          {(r.status === 'pending' || r.status === 'dispatched') && isProducer && (
            <Popconfirm title="确认取消此计划？" onConfirm={() => handleCancel(r)}>
              <Button size="small" danger icon={<DeleteOutlined />}>取消</Button>
            </Popconfirm>
          )}
          {r.status === 'dispatched' && isEngineer && (
            <Button size="small" type="primary" onClick={() => handleStart(r)}>开始</Button>
          )}
          {(r.status === 'ongoing' || r.status === 'dispatched') && isEngineer && (
            <Popconfirm title="确认结束直播？" onConfirm={() => handleEnd(r)}>
              <Button size="small" danger>结束</Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card
        title="直播计划列表"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
            {(isProducer || isDispatcher) && (
              <Button
                type="primary"
                danger
                icon={<ThunderboltOutlined />}
                onClick={createTemporary}
              >
                临时插播
              </Button>
            )}
            {(isProducer || true) && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => window.location.hash = '#/plan/create'}>
                新建计划
              </Button>
            )}
          </Space>
        }
      >
        <Spin spinning={loading}>
          <Table
            dataSource={plans}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1200 }}
            size="middle"
          />
        </Spin>
      </Card>

      <Modal
        title={
          selectedPlan ? (
            <Space>
              <span>调度分配</span>
              <Tag color="orange">{selectedPlan.title}</Tag>
              {selectedPlan.city && <Tag color="blue">📍 {selectedPlan.city}</Tag>}
              {selectedPlan.is_temporary && <Tag color="red" icon={<ThunderboltOutlined />}>临时插播</Tag>}
              <span style={{ color: '#666' }}>
                {dayjs(selectedPlan.start_time).format('MM-DD HH:mm')} ~ {dayjs(selectedPlan.end_time).format('HH:mm')}
              </span>
            </Space>
          ) : ''
        }
        open={dispatchModal}
        onCancel={() => setDispatchModal(false)}
        onOk={handleDispatch}
        width={600}
        okText="确认下发"
        confirmLoading={false}
      >
        {selectedPlan && (
          <Form form={dispatchForm} layout="vertical">
            <Form.Item
              label="选择转播车"
              name="vehicle_id"
              rules={[{ required: true, message: '请选择转播车' }]}
            >
              <Select
                placeholder="选择转播车"
                loading={checkingVehicle !== null}
                options={vehicles.map(v => ({
                  label: `${v.code} - ${v.name} [${v.status === 'available' ? '可用' : '使用中'}]`,
                  value: v.id
                }))}
                onSelect={checkVehicle}
              />
            </Form.Item>
            {vehicleAvailable && (
              <div style={{ marginBottom: 12, marginTop: -8 }}>
                {vehicleAvailable.available ? (
                  <Badge status="success" text="该车辆此时段可用" />
                ) : (
                  <div>
                    <Badge status="error" text="该车辆此时段不可用" />
                    {vehicleAvailable.conflict_plans?.length > 0 && (
                      <div style={{ color: '#d4380d', fontSize: 12, marginLeft: 22 }}>
                        冲突: {vehicleAvailable.conflict_plans.map(p => p.title).join(', ')}
                      </div>
                    )}
                    {vehicleAvailable.conflict_maintenance?.length > 0 && (
                      <div style={{ color: '#d4380d', fontSize: 12, marginLeft: 22 }}>
                        与检修安排冲突
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Form.Item
              label="选择频率"
              name="frequency_id"
              rules={[{ required: true, message: '请选择频率' }]}
            >
              <Select
                placeholder="选择频率"
                loading={checkingFreq !== null}
                options={frequencies.map(f => ({
                  label: `${f.code} - ${f.frequency} MHz (${f.band})`,
                  value: f.id
                }))}
                onSelect={checkFrequency}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
            {freqAvailable && (
              <div style={{ marginBottom: 12, marginTop: -8 }}>
                {freqAvailable.available ? (
                  <Badge status="success" text="该频率此时段可用" />
                ) : (
                  <div>
                    <Badge status="error" text="⚠️ 频率冲突，该频率此时段已被占用" />
                    {freqAvailable.conflicts?.length > 0 && (
                      <div style={{ color: '#d4380d', fontSize: 12, marginLeft: 22 }}>
                        冲突: {freqAvailable.conflicts.map(p => `${p.title}(${p.vehicle_code || '未分配'})`).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Form.Item label="调度备注" name="note">
              <Input.TextArea rows={2} placeholder="调度说明、注意事项..." />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <Drawer
        title="直播计划详情"
        width={600}
        open={detailDrawer}
        onClose={() => setDetailDrawer(false)}
      >
        {detailData && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="类型">
                <Space>
                  {detailData.is_temporary ? (
                    <Tag color="red" icon={<ThunderboltOutlined />}>临时插播</Tag>
                  ) : (
                    <Tag color="blue">常规直播</Tag>
                  )}
                  {detailData.frequency_switched && (
                    <Tag color="orange" icon={<SwapOutlined />}>频率已切换</Tag>
                  )}
                  {detailData.status === 'ended' && (
                    <Tag color="geekblue">信号记录只读</Tag>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="标题">{detailData.title}</Descriptions.Item>
              <Descriptions.Item label="城市">{detailData.city || '-'}</Descriptions.Item>
              <Descriptions.Item label="地点">{detailData.location}</Descriptions.Item>
              <Descriptions.Item label="时间">
                {dayjs(detailData.start_time).format('YYYY-MM-DD HH:mm')} ~ {dayjs(detailData.end_time).format('HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="制片">{detailData.producer_name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detailData.status].color}>{statusMap[detailData.status].text}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="转播车">
                {detailData.vehicle_code ? `${detailData.vehicle_code} - ${detailData.vehicle_name}` : '未分配'}
              </Descriptions.Item>
              <Descriptions.Item label="频率">
                <Space direction="vertical" size={0}>
                  {detailData.frequency_code ? (
                    <>
                      <span>{detailData.frequency_code} {detailData.frequency}MHz ({detailData.band})</span>
                      {detailData.last_frequency_switch_at && (
                        <span style={{ fontSize: 11, color: '#fa8c16' }}>
                          最后切换于 {dayjs(detailData.last_frequency_switch_at).format('MM-DD HH:mm')}
                        </span>
                      )}
                    </>
                  ) : '未分配'}
                </Space>
              </Descriptions.Item>
              {detailData.signal_quality && (
                <Descriptions.Item label="信号质量">
                  <Tag color={signalQualityMap[detailData.signal_quality].color}>
                    {signalQualityMap[detailData.signal_quality].text}
                  </Tag>
                </Descriptions.Item>
              )}
              {detailData.description && (
                <Descriptions.Item label="备注">{detailData.description}</Descriptions.Item>
              )}
            </Descriptions>

            <Divider orientation="left">信号回传记录 ({detailData.signal_records?.length || 0})
              {detailData.status === 'ended' && <Tag color="geekblue">只读</Tag>}
            </Divider>
            {detailData.signal_records && detailData.signal_records.length > 0 ? (
              <List
                size="small"
                dataSource={detailData.signal_records}
                renderItem={item => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <span style={{ fontSize: 12, color: '#999' }}>
                            {dayjs(item.recorded_at).format('HH:mm:ss')}
                          </span>
                          <span>👤 {item.engineer_name}</span>
                          {item.frequency_code && (
                            <Tag color="purple">📡 {item.frequency_code}</Tag>
                          )}
                          <Tag color={signalQualityMap[item.signal_quality].color}>
                            {item.signal_strength}% - {signalQualityMap[item.signal_quality].text}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space size="large" wrap>
                          <span>🎵 音频: {item.audio_status}</span>
                          <span>🎬 视频: {item.video_status}</span>
                          {item.note && <span style={{ color: '#666' }}>备注: {item.note}</span>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无信号记录</div>
            )}

            {detailData.frequency_switch_records && detailData.frequency_switch_records.length > 0 && (
              <>
                <Divider orientation="left">频率切换记录 ({detailData.frequency_switch_records.length})</Divider>
                <List
                  size="small"
                  dataSource={detailData.frequency_switch_records}
                  renderItem={item => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            <span style={{ fontSize: 12, color: '#999' }}>
                              {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                            </span>
                            <Tag color={switchReasonMap[item.reason]?.color || 'default'}>
                              {switchReasonMap[item.reason]?.text || item.reason}
                            </Tag>
                            <span>👤 {item.engineer_name}</span>
                          </Space>
                        }
                        description={
                          <Space size="small" wrap>
                            <span style={{ color: '#d4380d', textDecoration: 'line-through' }}>
                              {item.old_frequency_code}
                            </span>
                            <SwapOutlined style={{ color: '#1890ff' }} />
                            <span style={{ color: '#52c41a', fontWeight: 500 }}>
                              {item.new_frequency_code}
                            </span>
                            {item.note && <Text type="secondary">备注: {item.note}</Text>}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              </>
            )}

            {detailData.review_notes && (
              <>
                <Divider orientation="left">复盘记录</Divider>
                <Paragraph
                  style={{
                    background: '#f6ffed',
                    padding: 12,
                    borderRadius: 4,
                    border: '1px solid #b7eb8f',
                    whiteSpace: 'pre-wrap',
                    fontSize: 13
                  }}
                >
                  {detailData.review_notes}
                </Paragraph>
              </>
            )}

            {detailData.fault_reason && (
              <>
                <Divider orientation="left">故障原因</Divider>
                <Paragraph
                  style={{
                    background: '#fff2e8',
                    padding: 12,
                    borderRadius: 4,
                    border: '1px solid #ffbb96',
                    whiteSpace: 'pre-wrap',
                    fontSize: 13
                  }}
                >
                  {detailData.fault_reason}
                </Paragraph>
              </>
            )}

            {detailData.status === 'ended' && (
              <div style={{ marginTop: 16 }}>
                <Alert
                  type="info"
                  showIcon
                  message="直播已结束"
                  description="信号记录为只读状态，可点击「追加复盘」按钮添加复盘记录和故障原因说明。"
                />
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title={
          selectedPlan ? (
            <Space>
              <SwapOutlined />
              <span>切换备用频率</span>
              <Tag color="orange">{selectedPlan.title}</Tag>
            </Space>
          ) : ''
        }
        open={switchModal}
        onCancel={() => setSwitchModal(false)}
        onOk={handleSwitchFrequency}
        width={600}
        okText="确认切换"
        confirmLoading={false}
      >
        {selectedPlan && (
          <Form form={switchForm} layout="vertical">
            <Alert
              type="warning"
              showIcon
              message="频率切换说明"
              description={
                <>
                  <p>切换到备用频率后，原频率占用记录将保留在频率切换历史中，便于追溯。</p>
                  <p>当前使用频率：<Tag color="purple">{selectedPlan.frequency_code} {selectedPlan.frequency}MHz</Tag></p>
                </>
              }
              style={{ marginBottom: 16 }}
            />

            <Form.Item
              label="切换原因"
              name="reason"
              rules={[{ required: true, message: '请选择切换原因' }]}
            >
              <Select placeholder="选择切换原因">
                <Option value="signal_abnormal">信号异常</Option>
                <Option value="interference">信号干扰</Option>
                <Option value="quality_improve">质量提升</Option>
                <Option value="backup_test">备用测试</Option>
                <Option value="other">其他原因</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="选择备用频率"
              name="new_frequency_id"
              rules={[{ required: true, message: '请选择备用频率' }]}
            >
              <Select
                placeholder="选择可用的备用频率"
                loading={checkingBackupFreq}
                optionFilterProp="label"
                showSearch
              >
                {availableBackupFreqs.map(f => (
                  <Option
                    key={f.id}
                    value={f.id}
                    disabled={!f.available}
                  >
                    <Space>
                      <Tag color={f.is_backup ? 'orange' : 'purple'}>
                        {f.is_backup ? '备用' : '主用'}
                      </Tag>
                      <span>{f.code} - {f.frequency} MHz</span>
                      {!f.available && <Tag color="red">不可用</Tag>}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="切换说明" name="note">
              <TextArea
                rows={2}
                placeholder="请简要说明切换背景、信号异常现象等..."
              />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <Modal
        title={
          selectedPlan ? (
            <Space>
              <EditOutlined />
              <span>追加复盘和故障原因</span>
              <Tag color="orange">{selectedPlan.title}</Tag>
            </Space>
          ) : ''
        }
        open={reviewModal}
        onCancel={() => setReviewModal(false)}
        onOk={handleReview}
        width={600}
        okText="确认追加"
      >
        <Alert
          type="info"
          showIcon
          message="追加说明"
          description="复盘记录和故障原因将追加到现有记录后面，原有内容不会被覆盖或修改。"
          style={{ marginBottom: 16 }}
        />
        <Form form={reviewForm} layout="vertical">
          <Form.Item
            label="复盘记录"
            name="review_notes"
          >
            <TextArea
              rows={4}
              placeholder="直播过程总结、经验教训、改进建议等..."
            />
          </Form.Item>
          <Form.Item
            label="故障原因"
            name="fault_reason"
          >
            <TextArea
              rows={3}
              placeholder="如果有故障，请描述故障现象、原因分析、解决办法等..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PlanList;
