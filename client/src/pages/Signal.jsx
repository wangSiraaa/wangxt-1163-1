import React, { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Select,
  DatePicker, message, Spin, Popconfirm, Row, Col, Statistic, Alert, Typography,
  Drawer, Descriptions, Divider, List
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, WifiOutlined, SwapOutlined,
  EditOutlined, EyeOutlined
} from '@ant-design/icons';
import { signalsApi, plansApi, frequencySwitchApi, frequenciesApi } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;
const { Paragraph, Text } = Typography;

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

const statusMap = {
  pending: { text: '待调度', color: 'orange' },
  dispatched: { text: '已调度', color: 'blue' },
  ongoing: { text: '进行中', color: 'green' },
  ended: { text: '已结束', color: 'default' },
  cancelled: { text: '已取消', color: 'red' }
};

const audioStatusMap = {
  normal: { text: '正常', color: 'green' },
  abnormal: { text: '异常', color: 'orange' },
  none: { text: '无信号', color: 'red' }
};

const videoStatusMap = {
  normal: { text: '正常', color: 'green' },
  abnormal: { text: '异常', color: 'orange' },
  none: { text: '无信号', color: 'red' }
};

function Signal() {
  const [records, setRecords] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [addForm] = Form.useForm();
  const [switchModal, setSwitchModal] = useState(false);
  const [switchForm] = Form.useForm();
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewForm] = Form.useForm();
  const [detailDrawer, setDetailDrawer] = useState(false);
  const [detailPlan, setDetailPlan] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [availableBackupFreqs, setAvailableBackupFreqs] = useState([]);
  const [checkingBackupFreq, setCheckingBackupFreq] = useState(null);
  const { currentUser } = useApp();
  const isEngineer = currentUser?.role === 'engineer';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recs, planList] = await Promise.all([
        signalsApi.list(),
        plansApi.list()
      ]);
      setRecords(recs);
      setPlans(planList);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
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

  const openSwitchFrequency = (plan) => {
    if (plan.status === 'ended') {
      message.error('直播已结束，不能切换频率');
      return;
    }
    if (!plan.frequency_id) {
      message.error('当前计划没有分配频率，无法切换');
      return;
    }
    setSelectedPlan(plan);
    setAvailableBackupFreqs([]);
    switchForm.resetFields();
    loadBackupFrequencies(plan);
    setSwitchModal(true);
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
    } catch (e) {
      message.error(e.message);
    }
  };

  const openReview = (plan) => {
    if (plan.status !== 'ended') {
      message.error('直播未结束，暂不能追加复盘');
      return;
    }
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
    } catch (e) {
      message.error(e.message);
    }
  };

  const showPlanDetail = async (planId) => {
    try {
      const plan = await plansApi.get(planId);
      setDetailPlan(plan);
      setDetailDrawer(true);
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields();
      const plan = plans.find(p => p.id === values.plan_id);
      if (plan && plan.status === 'ended') {
        message.error('直播已结束，信号记录只读，不能新增记录');
        return;
      }
      await signalsApi.create({
        plan_id: values.plan_id,
        engineer_id: currentUser.id,
        engineer_name: currentUser.name,
        signal_strength: values.signal_strength,
        signal_quality: values.signal_quality,
        audio_status: values.audio_status,
        video_status: values.video_status,
        note: values.note,
        frequency_id: plan?.frequency_id,
        recorded_at: (values.recorded_at || dayjs()).format('YYYY-MM-DD HH:mm:ss')
      });
      message.success('信号记录已提交');
      setAddModal(false);
      addForm.resetFields();
      loadData();
    } catch (e) {
      if (e.message) message.error(e.message);
    }
  };

  const handleDelete = async (record) => {
    try {
      await signalsApi.remove(record.id);
      message.success('记录已删除');
      loadData();
    } catch (e) {
      message.error(e.message);
    }
  };

  const activePlans = plans.filter(p =>
    p.status === 'ongoing' || p.status === 'dispatched'
  );
  const endedPlans = plans.filter(p => p.status === 'ended');
  const ongoingOptions = activePlans.map(p => ({
    label: `${p.title} (${p.vehicle_code || '未分配车辆'} - ${dayjs(p.start_time).format('HH:mm')})`,
    value: p.id
  }));

  const columns = [
    {
      title: '记录时间',
      dataIndex: 'recorded_at',
      key: 'recorded_at',
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => dayjs(a.recorded_at).valueOf() - dayjs(b.recorded_at).valueOf(),
      defaultSortOrder: 'descend'
    },
    {
      title: '直播计划',
      dataIndex: 'plan_title',
      key: 'plan_title',
      render: (text, record) => {
        const plan = plans.find(p => p.id === record.plan_id);
        return (
          <Space>
            <span>{text}</span>
            {plan?.status === 'ended' && (
              <Tag color="geekblue">只读</Tag>
            )}
            {plan?.frequency_switched && (
              <Tag color="orange" icon={<SwapOutlined />}>已切换</Tag>
            )}
          </Space>
        );
      }
    },
    {
      title: '城市',
      key: 'city',
      width: 80,
      render: (_, r) => {
        const plan = plans.find(p => p.id === r.plan_id);
        return plan?.city || '-';
      }
    },
    {
      title: '车辆/频率',
      key: 'vehicle',
      render: (_, r) => {
        const plan = plans.find(p => p.id === r.plan_id);
        const recFreqCode = r.frequency_code;
        const planFreqCode = plan?.frequency_code;
        return (
          <Space direction="vertical" size={0}>
            {r.vehicle_code && <span>🚐 {r.vehicle_code} - {r.vehicle_name}</span>}
            {recFreqCode && (
              <span>
                📡 {recFreqCode} {r.frequency}MHz
                {planFreqCode && recFreqCode !== planFreqCode && (
                  <Tag color="orange" style={{ marginLeft: 4 }}>历史</Tag>
                )}
              </span>
            )}
            {!recFreqCode && planFreqCode && (
              <span style={{ color: '#666' }}>📡 {planFreqCode} {plan.frequency}MHz</span>
            )}
          </Space>
        );
      }
    },
    { title: '工程师', dataIndex: 'engineer_name', key: 'engineer' },
    {
      title: '信号强度',
      dataIndex: 'signal_strength',
      key: 'signal_strength',
      render: (v) => (
        <Space>
          <WifiOutlined style={{ color: v >= 70 ? '#52c41a' : v >= 40 ? '#faad14' : '#ff4d4f' }} />
          <span style={{ fontWeight: 600 }}>{v}%</span>
        </Space>
      )
    },
    {
      title: '信号质量',
      dataIndex: 'signal_quality',
      key: 'signal_quality',
      render: (q) => <Tag color={signalQualityMap[q].color}>{signalQualityMap[q].text}</Tag>
    },
    {
      title: '音频',
      dataIndex: 'audio_status',
      key: 'audio_status',
      render: (s) => <Tag color={audioStatusMap[s].color}>{audioStatusMap[s].text}</Tag>
    },
    {
      title: '视频',
      dataIndex: 'video_status',
      key: 'video_status',
      render: (s) => <Tag color={videoStatusMap[s].color}>{videoStatusMap[s].text}</Tag>
    },
    { title: '备注', dataIndex: 'note', key: 'note', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const plan = plans.find(p => p.id === record.plan_id);
        if (!plan) return null;
        const isEnded = plan.status === 'ended';
        const canSwitch = isEngineer && !isEnded && plan.frequency_id;
        const canDelete = isEngineer && !isEnded;
        return (
          <Space size="small" wrap>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showPlanDetail(plan.id)}>详情</Button>
            {canSwitch && (
              <Button
                size="small"
                icon={<SwapOutlined />}
                onClick={() => openSwitchFrequency(plan)}
              >
                切频率
              </Button>
            )}
            {isEnded && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openReview(plan)}
              >
                复盘
              </Button>
            )}
            {canDelete && (
              <Popconfirm title="确认删除此信号记录？" onConfirm={() => handleDelete(record)}>
                <Button type="link" danger size="small">删除</Button>
              </Popconfirm>
            )}
          </Space>
        );
      }
    }
  ];

  const excellentCount = records.filter(r => r.signal_quality === 'excellent').length;
  const goodCount = records.filter(r => r.signal_quality === 'good').length;
  const fairCount = records.filter(r => r.signal_quality === 'fair').length;
  const poorCount = records.filter(r => r.signal_quality === 'poor').length;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="信号优秀" value={excellentCount} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="信号良好" value={goodCount} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="信号一般" value={fairCount} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="信号较差" value={poorCount} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="进行中的直播">
            {activePlans.length > 0 ? (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {activePlans.map(plan => (
                  <Card key={plan.id} size="small" hoverable>
                    <Space wrap>
                      <Space direction="vertical" size={0} style={{ flex: 1, minWidth: 200 }}>
                        <Text strong>{plan.title}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {plan.city && `📍 ${plan.city} · `}
                          {plan.vehicle_code && `🚐 ${plan.vehicle_code} · `}
                          {plan.frequency_code && `📡 ${plan.frequency_code} ${plan.frequency}MHz`}
                        </Text>
                      </Space>
                      <Space>
                        {isEngineer && plan.frequency_id && (
                          <Button
                            size="small"
                            icon={<SwapOutlined />}
                            onClick={() => openSwitchFrequency(plan)}
                          >
                            切频率
                          </Button>
                        )}
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => showPlanDetail(plan.id)}
                        >
                          详情
                        </Button>
                      </Space>
                    </Space>
                  </Card>
                ))}
              </Space>
            ) : (
              <div style={{ color: '#999', textAlign: 'center', padding: 12 }}>暂无进行中的直播</div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="已结束的直播">
            {endedPlans.length > 0 ? (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {endedPlans.slice(0, 5).map(plan => (
                  <Card key={plan.id} size="small" hoverable>
                    <Space wrap>
                      <Space direction="vertical" size={0} style={{ flex: 1, minWidth: 200 }}>
                        <Space>
                          <Text strong>{plan.title}</Text>
                          <Tag color="geekblue">只读</Tag>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {plan.city && `📍 ${plan.city} · `}
                          {plan.vehicle_code && `🚐 ${plan.vehicle_code} · `}
                          {plan.frequency_code && `📡 ${plan.frequency_code} ${plan.frequency}MHz`}
                        </Text>
                      </Space>
                      <Space>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => openReview(plan)}
                        >
                          复盘
                        </Button>
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => showPlanDetail(plan.id)}
                        >
                          详情
                        </Button>
                      </Space>
                    </Space>
                  </Card>
                ))}
              </Space>
            ) : (
              <div style={{ color: '#999', textAlign: 'center', padding: 12 }}>暂无已结束的直播</div>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title="现场信号回传记录"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
            {isEngineer && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>
                回传信号
              </Button>
            )}
          </Space>
        }
      >
        <Spin spinning={loading}>
          <Table
            dataSource={records}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            size="middle"
          />
        </Spin>
      </Card>

      <Modal
        title="回传现场信号"
        open={addModal}
        onCancel={() => { setAddModal(false); addForm.resetFields(); }}
        onOk={handleAdd}
        width={500}
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            label="选择直播计划"
            name="plan_id"
            rules={[{ required: true, message: '请选择直播计划' }]}
          >
            <Select
              placeholder="选择进行中的直播计划"
              options={ongoingOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            label="信号强度 (%)"
            name="signal_strength"
            rules={[{ required: true, message: '请输入信号强度' }]}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="0-100" />
          </Form.Item>
          <Form.Item
            label="信号质量"
            name="signal_quality"
            rules={[{ required: true, message: '请选择信号质量' }]}
          >
            <Select
              options={[
                { label: '优秀', value: 'excellent' },
                { label: '良好', value: 'good' },
                { label: '一般', value: 'fair' },
                { label: '较差', value: 'poor' }
              ]}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="音频状态"
                name="audio_status"
                initialValue="normal"
              >
                <Select
                  options={[
                    { label: '正常', value: 'normal' },
                    { label: '异常', value: 'abnormal' },
                    { label: '无信号', value: 'none' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="视频状态"
                name="video_status"
                initialValue="normal"
              >
                <Select
                  options={[
                    { label: '正常', value: 'normal' },
                    { label: '异常', value: 'abnormal' },
                    { label: '无信号', value: 'none' }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="记录时间" name="recorded_at">
            <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="备注" name="note">
            <Input.TextArea rows={2} placeholder="现场情况说明..." />
          </Form.Item>
        </Form>
      </Modal>

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

      <Drawer
        title="直播计划详情"
        width={600}
        open={detailDrawer}
        onClose={() => setDetailDrawer(false)}
      >
        {detailPlan && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="类型">
                <Space>
                  {detailPlan.is_temporary ? (
                    <Tag color="red">临时插播</Tag>
                  ) : (
                    <Tag color="blue">常规直播</Tag>
                  )}
                  {detailPlan.frequency_switched && (
                    <Tag color="orange" icon={<SwapOutlined />}>频率已切换</Tag>
                  )}
                  {detailPlan.status === 'ended' && (
                    <Tag color="geekblue">信号记录只读</Tag>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="标题">{detailPlan.title}</Descriptions.Item>
              <Descriptions.Item label="城市">{detailPlan.city || '-'}</Descriptions.Item>
              <Descriptions.Item label="地点">{detailPlan.location}</Descriptions.Item>
              <Descriptions.Item label="时间">
                {dayjs(detailPlan.start_time).format('YYYY-MM-DD HH:mm')} ~ {dayjs(detailPlan.end_time).format('HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="制片">{detailPlan.producer_name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detailPlan.status]?.color || 'default'}>
                  {statusMap[detailPlan.status]?.text || detailPlan.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="转播车">
                {detailPlan.vehicle_code ? `${detailPlan.vehicle_code} - ${detailPlan.vehicle_name}` : '未分配'}
              </Descriptions.Item>
              <Descriptions.Item label="频率">
                <Space direction="vertical" size={0}>
                  {detailPlan.frequency_code ? (
                    <>
                      <span>{detailPlan.frequency_code} {detailPlan.frequency}MHz ({detailPlan.band})</span>
                      {detailPlan.last_frequency_switch_at && (
                        <span style={{ fontSize: 11, color: '#fa8c16' }}>
                          最后切换于 {dayjs(detailPlan.last_frequency_switch_at).format('MM-DD HH:mm')}
                        </span>
                      )}
                    </>
                  ) : '未分配'}
                </Space>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">信号回传记录 ({detailPlan.signal_records?.length || 0})
              {detailPlan.status === 'ended' && <Tag color="geekblue">只读</Tag>}
            </Divider>
            {detailPlan.signal_records && detailPlan.signal_records.length > 0 ? (
              <List
                size="small"
                dataSource={detailPlan.signal_records}
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

            {detailPlan.frequency_switch_records && detailPlan.frequency_switch_records.length > 0 && (
              <>
                <Divider orientation="left">频率切换记录 ({detailPlan.frequency_switch_records.length})</Divider>
                <List
                  size="small"
                  dataSource={detailPlan.frequency_switch_records}
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

            {detailPlan.review_notes && (
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
                  {detailPlan.review_notes}
                </Paragraph>
              </>
            )}

            {detailPlan.fault_reason && (
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
                  {detailPlan.fault_reason}
                </Paragraph>
              </>
            )}

            {detailPlan.status === 'ended' && (
              <div style={{ marginTop: 16 }}>
                <Alert
                  type="info"
                  showIcon
                  message="直播已结束"
                  description="信号记录为只读状态，可点击「复盘」按钮添加复盘记录和故障原因说明。"
                />
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default Signal;
