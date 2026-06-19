import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Menu, Select, Avatar, Dropdown, Space, Typography } from 'antd';
import {
  CalendarOutlined,
  RadarChartOutlined,
  CarOutlined,
  WifiOutlined,
  FileAddOutlined,
  UserOutlined,
  SettingOutlined,
  DashboardOutlined
} from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Calendar from './pages/Calendar.jsx';
import Frequency from './pages/Frequency.jsx';
import Vehicle from './pages/Vehicle.jsx';
import Signal from './pages/Signal.jsx';
import PlanCreate from './pages/PlanCreate.jsx';
import PlanList from './pages/PlanList.jsx';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

function App() {
  const location = useLocation();
  const { currentUser, users, switchUser, loading, roleMap } = useApp();

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;
  }

  const selectedKey = location.pathname.split('/')[1] || 'dashboard';

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/dashboard">系统概览</Link>
    },
    {
      key: 'calendar',
      icon: <CalendarOutlined />,
      label: <Link to="/calendar">直播日历</Link>
    },
    {
      key: 'frequency',
      icon: <RadarChartOutlined />,
      label: <Link to="/frequency">频率占用</Link>
    },
    {
      key: 'vehicle',
      icon: <CarOutlined />,
      label: <Link to="/vehicle">车辆状态</Link>
    },
    {
      key: 'signal',
      icon: <WifiOutlined />,
      label: <Link to="/signal">现场回传</Link>
    },
    {
      key: 'plan',
      icon: <FileAddOutlined />,
      label: '直播计划',
      children: [
        { key: 'plan-create', label: <Link to="/plan/create">提交计划</Link> },
        { key: 'plan-list', label: <Link to="/plan/list">计划列表</Link> }
      ]
    }
  ];

  const userMenu = {
    items: users.map(u => ({
      key: u.id,
      label: (
        <Space>
          <span>{u.name}</span>
          <span style={{ color: '#888', fontSize: 12 }}>
            [{roleMap[u.role].label}]
          </span>
        </Space>
      )
    })),
    onClick: ({ key }) => {
      const user = users.find(u => u.id === Number(key));
      if (user) switchUser(user);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} style={{ background: '#001529' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Title level={4} style={{ color: '#fff', margin: 0 }}>
            📡 直播协调系统
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['plan']}
          items={menuItems}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,21,41,0.08)' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {menuItems.find(i => i.key === selectedKey)?.label?.props?.children || 
               (selectedKey.startsWith('plan') ? '直播计划' : '')}
            </Title>
          </div>
          <Space>
            <span style={{ color: '#666' }}>切换角色:</span>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                <Avatar size="small" icon={<UserOutlined />} />
                <span>
                  <strong>{currentUser?.name}</strong>
                  <span style={{ color: '#888', marginLeft: 4 }}>
                    [{roleMap[currentUser?.role]?.label}]
                  </span>
                </span>
                <SettingOutlined style={{ fontSize: 12, color: '#999' }} />
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content className="page-container">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/frequency" element={<Frequency />} />
            <Route path="/vehicle" element={<Vehicle />} />
            <Route path="/signal" element={<Signal />} />
            <Route path="/plan/create" element={<PlanCreate />} />
            <Route path="/plan/list" element={<PlanList />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
