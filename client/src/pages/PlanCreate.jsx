import React, { useState, useEffect } from 'react';
import { Card, Form, Input, DatePicker, Button, message, Space, Alert, Checkbox, Select, Tag } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { plansApi } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Option } = Select;

function extractCity(location) {
  if (!location) return '';
  const cityMatch = location.match(/(北京|上海|广州|深圳|杭州|南京|成都|重庆|武汉|西安|天津|苏州|长沙|郑州|青岛|大连|厦门|济南|福州|合肥)/);
  if (cityMatch) return cityMatch[1];
  const firstPart = location.split(/[\/\-]/)[0].trim();
  return firstPart || location;
}

const cityOptions = [
  '北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '重庆', '武汉', '西安',
  '天津', '苏州', '长沙', '郑州', '青岛', '大连', '厦门', '济南', '福州', '合肥'
];

function PlanCreate() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useApp();
  const [isTemporary, setIsTemporary] = useState(false);
  const [autoDetectedCity, setAutoDetectedCity] = useState('');

  const isProducer = currentUser?.role === 'producer';

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('temporary') === '1') {
      setIsTemporary(true);
      form.setFieldsValue({ is_temporary: true });
    }
  }, [location, form]);

  const handleLocationChange = (e) => {
    const loc = e.target.value;
    const city = extractCity(loc);
    setAutoDetectedCity(city);
    if (city && !form.getFieldValue('city')) {
      form.setFieldsValue({ city });
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const planData = {
        title: values.title,
        location: values.location,
        start_time: values.time_range[0].format('YYYY-MM-DD HH:mm:ss'),
        end_time: values.time_range[1].format('YYYY-MM-DD HH:mm:ss'),
        producer_id: currentUser.id,
        producer_name: currentUser.name,
        description: values.description,
        city: values.city,
        is_temporary: values.is_temporary ? 1 : 0
      };

      if (values.is_temporary) {
        await plansApi.createTemporary({
          ...planData,
          reason: values.temporary_reason
        });
        message.success('临时插播计划已创建，请尽快安排调度');
      } else {
        await plansApi.create(planData);
        message.success('直播计划已提交，等待调度');
      }
      navigate('/plan/list');
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {!isProducer && (
        <Alert
          type="warning"
          showIcon
          message="角色提示"
          description="当前您不是制片角色，提交后将使用当前登录身份作为提交人。您可以在右上角切换角色。"
          style={{ marginBottom: 16 }}
        />
      )}
      {isTemporary && (
        <Alert
          type="warning"
          showIcon
          message="临时插播"
          description="您正在创建临时插播计划，请确保填写紧急原因。创建后将优先进行调度处理。"
          style={{ marginBottom: 16 }}
        />
      )}
      <Card title={isTemporary ? "创建临时插播计划" : "提交直播计划"}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            time_range: isTemporary
              ? [dayjs().add(30, 'minute'), dayjs().add(90, 'minute')]
              : [dayjs().add(1, 'hour'), dayjs().add(3, 'hour')],
            is_temporary: isTemporary
          }}
        >
          <Form.Item name="is_temporary" valuePropName="checked">
            <Checkbox onChange={(e) => setIsTemporary(e.target.checked)}>
              <Space>
                <span>标记为临时插播</span>
                <Tag color="orange">紧急</Tag>
              </Space>
            </Checkbox>
          </Form.Item>

          {isTemporary && (
            <Form.Item
              label="插播原因"
              name="temporary_reason"
              rules={[{ required: true, message: '请填写临时插播原因' }]}
            >
              <Select placeholder="选择插播原因">
                <Option value="breaking_news">突发新闻</Option>
                <Option value="important_event">重大事件</Option>
                <Option value="emergency">紧急情况</Option>
                <Option value="signal_recovery">信号恢复</Option>
                <Option value="other">其他原因</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item
            label="直播标题"
            name="title"
            rules={[{ required: true, message: '请输入直播标题' }]}
          >
            <Input placeholder="如：2026春节联欢晚会现场直播" size="large" />
          </Form.Item>

          <Form.Item
            label="直播地点"
            name="location"
            rules={[{ required: true, message: '请输入直播地点' }]}
          >
            <Input
              placeholder="如：北京/一号演播厅 / 天安门广场"
              size="large"
              onChange={handleLocationChange}
            />
          </Form.Item>

          <Form.Item
            label="城市"
            name="city"
            rules={[{ required: true, message: '请选择或输入城市' }]}
            extra={autoDetectedCity && <span style={{ color: '#52c41a' }}>已自动识别城市：{autoDetectedCity}</span>}
          >
            <Select
              placeholder="选择城市（用于同城频率冲突检测）"
              showSearch
              allowClear
              size="large"
            >
              {cityOptions.map(city => (
                <Option key={city} value={city}>{city}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="直播时间"
            name="time_range"
            rules={[{ required: true, message: '请选择直播时间段' }]}
          >
            <RangePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              size="large"
            />
          </Form.Item>

          <Form.Item label="备注说明" name="description">
            <TextArea
              rows={4}
              placeholder="直播内容说明、特殊要求等..."
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                size="large"
                loading={loading}
                onClick={handleSubmit}
                danger={isTemporary}
              >
                {isTemporary ? "提交临时插播" : "提交计划"}
              </Button>
              <Button size="large" onClick={() => navigate(-1)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default PlanCreate;
