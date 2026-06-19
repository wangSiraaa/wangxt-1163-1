import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Tag, List, Typography, Spin, Space } from 'antd';
import {
  VideoCameraOutlined,
  CarOutlined,
  RadarChartOutlined,
  WifiOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { dashboardApi, plansApi } from '../services/api.js';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const statusMap = {
  pending: { text: '待调度', color: 'orange' },
  dispatched: { text: '已调度', color: 'blue' },
  ongoing: { text: '进行中', color: 'green' },
  ended: { text: '已结束', color: 'default' },
  cancelled: { text: '已取消', color: 'red' }
};

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sum, planList] = await Promise.all([
        dashboardApi.getSummary(),
        plansApi.list({ start_date: dayjs().format('YYYY-MM-DD') })
      ]);
      setSummary(sum);
      setPlans(planList.slice(0, 10));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !summary) {
    return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  }

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日直播计划"
              value={summary.plans.today}
              prefix={<VideoCameraOutlined style={{ color: '#1677ff' }} />}
              suffix={`/ 共 ${summary.plans.total}`}
            />
            <div style={{ marginTop: 8 }}>
              <Tag color="orange">待调度 {summary.plans.pending}</Tag>
              <Tag color="green">进行中 {summary.plans.ongoing}</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="转播车状态"
              value={summary.vehicles.available}
              prefix={<CarOutlined style={{ color: '#52c41a' }} />}
              suffix={`可用 / ${summary.vehicles.total}`}
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8 }}>
              <Tag color="blue">使用中 {summary.vehicles.in_use}</Tag>
              <Tag color="red">检修 {summary.vehicles.maintenance}</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="频率资源"
              value={summary.frequencies.available}
              prefix={<RadarChartOutlined style={{ color: '#722ed1' }} />}
              suffix={`空闲 / ${summary.frequencies.total}`}
              valueStyle={{ color: '#722ed1' }}
            />
            <div style={{ marginTop: 8 }}>
              <Tag color="orange">占用中 {summary.frequencies.occupied}</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日信号回传"
              value={summary.signals.today}
              prefix={<WifiOutlined style={{ color: '#13c2c2' }} />}
              suffix={`条 / 累计 ${summary.signals.total}`}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                <span>近期直播计划</span>
              </Space>
            }
          >
            {plans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无直播计划
              </div>
            ) : (
              <List
                dataSource={plans}
                renderItem={item => (
                  <List.Item
                    actions={[<Tag color={statusMap[item.status].color}>{statusMap[item.status].text}</Tag>]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{item.title}</Text>
                          {item.vehicle_code && <Tag color="blue">🚐 {item.vehicle_code}</Tag>}
                          {item.frequency_code && <Tag color="purple">📡 {item.frequency_code} {item.frequency}MHz</Tag>}
                        </Space>
                      }
                      description={
                        <Space size="large">
                          <span>📍 {item.location}</span>
                          <span>🕐 {dayjs(item.start_time).format('MM-DD HH:mm')} ~ {dayjs(item.end_time).format('HH:mm')}</span>
                          <span>👤 制片: {item.producer_name}</span>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Dashboard;
