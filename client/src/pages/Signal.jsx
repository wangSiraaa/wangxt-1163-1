import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Select, DatePicker, message, Spin, Popconfirm, Row, Col, Statistic } from 'antd';
import { PlusOutlined, ReloadOutlined, WifiOutlined } from '@ant-design/icons';
import { signalsApi, plansApi } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import dayjs from 'dayjs';

const signalQualityMap = {
  excellent: { text: '优秀', color: 'green' },
  good: { text: '良好', color: 'blue' },
  fair: { text: '一般', color: 'orange' },
  poor: { text: '较差', color: 'red' }
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
        plansApi.list({ status: 'ongoing' })
      ]);
      setRecords(recs);
      setPlans(planList);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields();
      await signalsApi.create({
        plan_id: values.plan_id,
        engineer_id: currentUser.id,
        engineer_name: currentUser.name,
        signal_strength: values.signal_strength,
        signal_quality: values.signal_quality,
        audio_status: values.audio_status,
        video_status: values.video_status,
        note: values.note,
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

  const ongoingOptions = plans
    .filter(p => p.status === 'ongoing' || p.status === 'dispatched')
    .map(p => ({
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
    { title: '直播计划', dataIndex: 'plan_title', key: 'plan_title' },
    {
      title: '车辆/频率',
      key: 'vehicle',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          {r.vehicle_code && <span>🚐 {r.vehicle_code} - {r.vehicle_name}</span>}
          {r.frequency_code && <span>📡 {r.frequency_code} {r.frequency}MHz</span>}
        </Space>
      )
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
      render: (_, record) => {
        const plan = plans.find(p => p.id === record.plan_id);
        const canDelete = isEngineer && plan && plan.status !== 'ended';
        return canDelete ? (
          <Popconfirm title="确认删除此信号记录？" onConfirm={() => handleDelete(record)}>
            <Button type="link" danger size="small">删除</Button>
          </Popconfirm>
        ) : (
          <span style={{ color: '#999', fontSize: 12 }}>直播已结束，不可撤回</span>
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
    </div>
  );
}

export default Signal;
