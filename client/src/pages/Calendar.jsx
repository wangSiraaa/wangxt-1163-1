import React, { useState, useEffect } from 'react';
import { Calendar, Badge, Card, Modal, Tag, Space, Descriptions, Button, Spin, message } from 'antd';
import dayjs from 'dayjs';
import { dashboardApi, plansApi } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';

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

function CalendarPage() {
  const [plans, setPlans] = useState([]);
  const [selectedValue, setSelectedValue] = useState(null);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const { currentUser } = useApp();

  useEffect(() => {
    loadPlans();
  }, [selectedDate]);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const start = selectedDate.startOf('month').format('YYYY-MM-DD');
      const end = selectedDate.endOf('month').format('YYYY-MM-DD');
      const data = await dashboardApi.getTimeline({ start_date: start, end_date: end });
      setPlans(data);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const getListData = (value) => {
    const dayPlans = plans.filter(p =>
      dayjs(p.start_time).isSame(value, 'day') ||
      dayjs(p.end_time).isSame(value, 'day') ||
      (dayjs(p.start_time).isBefore(value, 'day') && dayjs(p.end_time).isAfter(value, 'day'))
    );
    return dayPlans;
  };

  const dateCellRender = (value) => {
    const listData = getListData(value);
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {listData.slice(0, 3).map(item => (
          <li key={item.id} style={{ fontSize: 12, marginBottom: 2 }}>
            <Badge
              status={
                item.status === 'ongoing' ? 'success' :
                item.status === 'pending' ? 'warning' :
                item.status === 'dispatched' ? 'processing' :
                item.status === 'cancelled' ? 'error' : 'default'
              }
              text={
                <span onClick={() => showDetail(item)} style={{ cursor: 'pointer' }}>
                  {dayjs(item.start_time).format('HH:mm')} {item.title}
                </span>
              }
            />
          </li>
        ))}
        {listData.length > 3 && (
          <li style={{ fontSize: 12, color: '#999' }}>+{listData.length - 3} 更多</li>
        )}
      </ul>
    );
  };

  const showDetail = async (plan) => {
    try {
      const data = await plansApi.get(plan.id);
      setDetail(data);
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleStart = async () => {
    try {
      await plansApi.start(detail.id);
      message.success('直播已开始');
      showDetail(detail);
      loadPlans();
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleEnd = async () => {
    try {
      await plansApi.end(detail.id);
      message.success('直播已结束');
      setDetail(null);
      loadPlans();
    } catch (e) {
      message.error(e.message);
    }
  };

  return (
    <div>
      <Card>
        <Spin spinning={loading}>
          <Calendar
            value={selectedDate}
            onChange={setSelectedDate}
            onSelect={(v) => setSelectedValue(v)}
            cellRender={dateCellRender}
          />
        </Spin>
      </Card>

      <Modal
        title={detail?.title || '直播详情'}
        open={!!detail}
        onCancel={() => setDetail(null)}
        width={700}
        footer={
          detail && (
            <Space>
              <Button onClick={() => setDetail(null)}>关闭</Button>
              {detail.status === 'dispatched' && currentUser?.role === 'engineer' && (
                <Button type="primary" onClick={handleStart}>开始直播</Button>
              )}
              {(detail.status === 'ongoing' || detail.status === 'dispatched') && currentUser?.role === 'engineer' && (
                <Button danger onClick={handleEnd}>结束直播</Button>
              )}
            </Space>
          )
        }
      >
        {detail && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="标题" span={2}>{detail.title}</Descriptions.Item>
              <Descriptions.Item label="地点">{detail.location}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detail.status].color}>{statusMap[detail.status].text}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">{dayjs(detail.start_time).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              <Descriptions.Item label="结束时间">{dayjs(detail.end_time).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              <Descriptions.Item label="制片">{detail.producer_name}</Descriptions.Item>
              <Descriptions.Item label="转播车">
                {detail.vehicle_code ? `${detail.vehicle_code} (${detail.vehicle_name})` : '未分配'}
              </Descriptions.Item>
              <Descriptions.Item label="频率">
                {detail.frequency_code ? `${detail.frequency_code} ${detail.frequency}MHz (${detail.band})` : '未分配'}
              </Descriptions.Item>
              {detail.signal_quality && (
                <Descriptions.Item label="信号质量">
                  <Tag color={signalQualityMap[detail.signal_quality].color}>
                    {signalQualityMap[detail.signal_quality].text}
                  </Tag>
                </Descriptions.Item>
              )}
              {detail.description && (
                <Descriptions.Item label="备注" span={2}>{detail.description}</Descriptions.Item>
              )}
            </Descriptions>

            {detail.signal_records && detail.signal_records.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4>信号回传记录 ({detail.signal_records.length}条)</h4>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {detail.signal_records.map(s => (
                    <div key={s.id} style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                      <Space size="large">
                        <span style={{ color: '#888' }}>{dayjs(s.recorded_at).format('HH:mm:ss')}</span>
                        <span>👤 {s.engineer_name}</span>
                        <span>📶 强度: {s.signal_strength}%</span>
                        <Tag color={signalQualityMap[s.signal_quality].color}>
                          {signalQualityMap[s.signal_quality].text}
                        </Tag>
                        <span>🎵 音频: {s.audio_status}</span>
                        <span>🎬 视频: {s.video_status}</span>
                        {s.note && <span style={{ color: '#666' }}>备注: {s.note}</span>}
                      </Space>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default CalendarPage;
