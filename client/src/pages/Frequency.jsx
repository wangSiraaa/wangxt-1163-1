import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Button, Space, DatePicker, Table, Modal, message, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { frequenciesApi } from '../services/api.js';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const statusMap = {
  pending: { text: '待调度', color: 'orange' },
  dispatched: { text: '已调度', color: 'blue' },
  ongoing: { text: '进行中', color: 'green' },
  ended: { text: '已结束', color: 'default' }
};

function Frequency() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState([dayjs().startOf('day'), dayjs().add(7, 'day').endOf('day')]);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = {
        start_date: dateRange[0]?.format('YYYY-MM-DD'),
        end_date: dateRange[1]?.format('YYYY-MM-DD')
      };
      const list = await frequenciesApi.getOccupancy(params);
      setData(list);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'start_time',
      key: 'time',
      render: (_, record) => (
        <div>
          <div>{dayjs(record.start_time).format('YYYY-MM-DD HH:mm')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>
            至 {dayjs(record.end_time).format('HH:mm')}
          </div>
        </div>
      )
    },
    { title: '直播计划', dataIndex: 'title', key: 'title' },
    { title: '转播车', dataIndex: 'vehicle_name', key: 'vehicle', render: (t, r) => t ? `${r.vehicle_code} - ${t}` : '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text}</Tag>
    }
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <span>频率占用总览</span>
            <RangePicker
              showTime
              value={dateRange}
              onChange={setDateRange}
              format="YYYY-MM-DD HH:mm"
            />
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          <Row gutter={[16, 16]}>
            {data.map(freq => {
              const activePlans = freq.plans.filter(p => ['pending', 'dispatched', 'ongoing'].includes(p.status));
              const occupied = activePlans.length > 0;
              return (
                <Col span={12} key={freq.id}>
                  <Card
                    size="small"
                    title={
                      <Space>
                        <strong>📡 {freq.code}</strong>
                        <Tag color="purple">{freq.frequency} MHz</Tag>
                        <Tag>{freq.band}</Tag>
                        {occupied ? (
                          <Tag color="orange">占用中 ({activePlans.length})</Tag>
                        ) : (
                          <Tag color="green">空闲</Tag>
                        )}
                      </Space>
                    }
                    extra={
                      freq.plans.length > 0 && (
                        <Button size="small" onClick={() => setDetail(freq)}>详情</Button>
                      )
                    }
                    style={{ marginBottom: 0 }}
                  >
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {freq.plans.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: '20px 0' }}>
                          此频率当前无排期
                        </div>
                      ) : (
                        freq.plans.map(p => (
                          <div
                            key={p.id}
                            style={{
                              padding: '6px 10px',
                              borderLeft: `3px solid ${
                                p.status === 'ongoing' ? '#52c41a' :
                                p.status === 'dispatched' ? '#1677ff' :
                                p.status === 'pending' ? '#faad14' : '#bfbfbf'
                              }`,
                              marginBottom: 4,
                              background: '#fafafa',
                              fontSize: 13
                            }}
                          >
                            <Space size="large" wrap>
                              <Tag color={statusMap[p.status]?.color}>{statusMap[p.status]?.text}</Tag>
                              <span>{dayjs(p.start_time).format('MM-DD HH:mm')} ~ {dayjs(p.end_time).format('HH:mm')}</span>
                              <strong>{p.title}</strong>
                              {p.vehicle_code && <span>🚐 {p.vehicle_code}</span>}
                            </Space>
                          </div>
                        ))
                      )}
                    </div>
                    {freq.description && (
                      <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>{freq.description}</div>
                    )}
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Spin>
      </Card>

      <Modal
        title={detail ? `频率 ${detail.code} - ${detail.frequency} MHz 使用记录` : ''}
        open={!!detail}
        onCancel={() => setDetail(null)}
        width={700}
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detail && (
          <Table
            size="small"
            dataSource={detail.plans}
            columns={columns}
            rowKey="id"
            pagination={false}
          />
        )}
      </Modal>
    </div>
  );
}

export default Frequency;
