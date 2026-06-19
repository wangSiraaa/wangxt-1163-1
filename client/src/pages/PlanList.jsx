import React, { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Button, Space, Modal, Form, Select, Input, DatePicker,
  message, Popconfirm, Drawer, Descriptions, Divider, List, Spin, Badge
} from 'antd';
import { ReloadOutlined, PlusOutlined, SendOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { plansApi, dispatchesApi, vehiclesApi, frequenciesApi, signalsApi } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import dayjs from 'dayjs';

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
      message.error(e.message);
    }
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
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
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
      width: 150,
      render: (_, r) => r.frequency_code ? (
        <Tag color="purple">
          📡 {r.frequency_code} {r.frequency}MHz
        </Tag>
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
      width: 280,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small" wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(r)}>详情</Button>
          {r.status === 'pending' && isDispatcher && (
            <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => openDispatch(r)}>
              调度
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
              <Descriptions.Item label="标题">{detailData.title}</Descriptions.Item>
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
                {detailData.frequency_code ? `${detailData.frequency_code} ${detailData.frequency}MHz (${detailData.band})` : '未分配'}
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

            <Divider orientation="left">信号回传记录 ({detailData.signal_records?.length || 0})</Divider>
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
                          <Tag color={signalQualityMap[item.signal_quality].color}>
                            {item.signal_strength}% - {signalQualityMap[item.signal_quality].text}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space size="large">
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
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default PlanList;
