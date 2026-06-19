import React, { useState } from 'react';
import { Card, Form, Input, DatePicker, Button, message, Space, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { plansApi } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

function PlanCreate() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { currentUser } = useApp();

  const isProducer = currentUser?.role === 'producer';

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await plansApi.create({
        title: values.title,
        location: values.location,
        start_time: values.time_range[0].format('YYYY-MM-DD HH:mm:ss'),
        end_time: values.time_range[1].format('YYYY-MM-DD HH:mm:ss'),
        producer_id: currentUser.id,
        producer_name: currentUser.name,
        description: values.description
      });
      message.success('直播计划已提交，等待调度');
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
      <Card title="提交直播计划">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            time_range: [dayjs().add(1, 'hour'), dayjs().add(3, 'hour')]
          }}
        >
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
            <Input placeholder="如：一号演播厅 / 天安门广场" size="large" />
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
              >
                提交计划
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
