import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Button, Space, Table, Modal, Form, DatePicker, Input, message, Spin, Popconfirm, Descriptions } from 'antd';
import { PlusOutlined, ToolOutlined, ReloadOutlined } from '@ant-design/icons';
import { vehiclesApi, plansApi } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import dayjs from 'dayjs';

const statusMap = {
  available: { text: '可用', color: 'green' },
  in_use: { text: '使用中', color: 'blue' },
  maintenance: { text: '检修中', color: 'red' }
};

function Vehicle() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [maintModal, setMaintModal] = useState(false);
  const [maintForm] = Form.useForm();
  const [activePlans, setActivePlans] = useState([]);
  const { currentUser } = useApp();
  const canManage = currentUser?.role === 'dispatcher';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [vList, pList] = await Promise.all([
        vehiclesApi.list(),
        plansApi.list({ status: 'ongoing' })
      ]);
      setVehicles(vList);
      setActivePlans(pList);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const showDetail = async (v) => {
    try {
      const data = await vehiclesApi.get(v.id);
      setSelected(data);
      setDetailModal(true);
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleAddMaintenance = async () => {
    try {
      const values = await maintForm.validateFields();
      await vehiclesApi.addMaintenance(selected.id, {
        start_time: values.range[0].format('YYYY-MM-DD HH:mm:ss'),
        end_time: values.range[1].format('YYYY-MM-DD HH:mm:ss'),
        reason: values.reason
      });
      message.success('检修计划已添加');
      setMaintModal(false);
      maintForm.resetFields();
      loadData();
    } catch (e) {
      if (e.message) message.error(e.message);
    }
  };

  const handleSetAvailable = async (v) => {
    try {
      await vehiclesApi.updateStatus(v.id, 'available');
      message.success('状态已更新');
      loadData();
    } catch (e) {
      message.error(e.message);
    }
  };

  const planColumns = [
    {
      title: '时间',
      key: 'time',
      render: (_, r) => (
        <div>
          <div>{dayjs(r.start_time).format('MM-DD HH:mm')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>至 {dayjs(r.end_time).format('HH:mm')}</div>
        </div>
      )
    },
    { title: '直播计划', dataIndex: 'title', key: 'title' },
    { title: '地点', dataIndex: 'location', key: 'location' },
    { title: '制片', dataIndex: 'producer_name', key: 'producer' }
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <span>转播车状态总览</span>
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          </Space>
        }
        extra={
          <Space>
            <Tag color="green">● 可用 {vehicles.filter(v => v.status === 'available').length}</Tag>
            <Tag color="blue">● 使用中 {vehicles.filter(v => v.status === 'in_use').length}</Tag>
            <Tag color="red">● 检修 {vehicles.filter(v => v.status === 'maintenance').length}</Tag>
          </Space>
        }
      >
        <Spin spinning={loading}>
          <Row gutter={[16, 16]}>
            {vehicles.map(v => (
              <Col span={12} key={v.id}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <strong>🚐 {v.code}</strong>
                      <span>{v.name}</span>
                      <Tag color={statusMap[v.status].color}>{statusMap[v.status].text}</Tag>
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button size="small" onClick={() => showDetail(v)}>详情</Button>
                      {canManage && v.status === 'maintenance' && (
                        <Popconfirm title="确认标记为可用？" onConfirm={() => handleSetAvailable(v)}>
                          <Button size="small" type="primary">解除检修</Button>
                        </Popconfirm>
                      )}
                    </Space>
                  }
                >
                  {v.description && (
                    <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>{v.description}</div>
                  )}
                  {v.upcoming_maintenances && v.upcoming_maintenances.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: '#d4380d', marginBottom: 4 }}>
                        <ToolOutlined /> 即将检修:
                      </div>
                      {v.upcoming_maintenances.slice(0, 2).map(m => (
                        <div key={m.id} style={{ fontSize: 12, color: '#d4380d', padding: '2px 0' }}>
                          {dayjs(m.start_time).format('MM-DD HH:mm')} ~ {dayjs(m.end_time).format('MM-DD HH:mm')}
                          {m.reason && ` - ${m.reason}`}
                        </div>
                      ))}
                    </div>
                  )}
                  {v.status === 'in_use' && (() => {
                    const plan = activePlans.find(p => p.vehicle_id === v.id);
                    if (plan) {
                      return (
                        <div style={{ marginTop: 8, padding: 8, background: '#e6f4ff', borderRadius: 4, fontSize: 13 }}>
                          <Space size="large" wrap>
                            <Tag color="green">● 直播中</Tag>
                            <span>{plan.title}</span>
                            <span>📍 {plan.location}</span>
                            <span>👤 {plan.producer_name}</span>
                          </Space>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </Card>
              </Col>
            ))}
          </Row>
        </Spin>
      </Card>

      <Modal
        title={selected ? `${selected.code} - ${selected.name}` : ''}
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        width={700}
        footer={
          selected && canManage && (
            <Space>
              <Button onClick={() => setDetailModal(false)}>关闭</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setMaintModal(true)}
              >
                添加检修
              </Button>
            </Space>
          )
        }
      >
        {selected && (
          <div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="车辆编号">{selected.code}</Descriptions.Item>
              <Descriptions.Item label="车辆名称">{selected.name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[selected.status].color}>{statusMap[selected.status].text}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {dayjs(selected.updated_at).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
              {selected.description && (
                <Descriptions.Item label="描述" span={2}>{selected.description}</Descriptions.Item>
              )}
            </Descriptions>

            {selected.maintenances && selected.maintenances.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4>检修记录</h4>
                <Table
                  size="small"
                  dataSource={selected.maintenances}
                  rowKey="id"
                  pagination={false}
                  columns={[
                    {
                      title: '时间',
                      key: 'time',
                      render: (_, r) => (
                        <span>
                          {dayjs(r.start_time).format('YYYY-MM-DD HH:mm')} ~ {dayjs(r.end_time).format('MM-DD HH:mm')}
                        </span>
                      )
                    },
                    { title: '原因', dataIndex: 'reason', key: 'reason' }
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        title="添加检修计划"
        open={maintModal}
        onCancel={() => { setMaintModal(false); maintForm.resetFields(); }}
        onOk={handleAddMaintenance}
      >
        <Form form={maintForm} layout="vertical">
          <Form.Item
            label="检修时间"
            name="range"
            rules={[{ required: true, message: '请选择检修时间段' }]}
          >
            <RangePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="检修原因" name="reason">
            <Input.TextArea rows={3} placeholder="请输入检修原因" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Vehicle;
