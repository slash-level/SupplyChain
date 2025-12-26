import React, { useMemo, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartOptions, Plugin } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels'; // datalabelsプラグインをインポート
import { Requirement, Status } from '../App'; // Assuming Status is exported from App.tsx

// Chart.jsのコンポーネントを登録
ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels); // datalabelsプラグインを登録

interface DashboardProps {
  requirements: Requirement[]; // requirementsは必須
  id?: string; // idはオプション
}

const Dashboard: React.FC<DashboardProps> = ({ requirements, id }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const chartData = useMemo(() => {
    const statusCounts: { [key in Status]?: number } = {
      '達成': 0,
      '未達成': 0,
      '一部達成': 0,
      '該当なし': 0,
      '未評価': 0,
    };

    requirements.forEach(req => {
      statusCounts[req.overallStatus] = (statusCounts[req.overallStatus] || 0) + 1;
    });

    const totalRequirements = requirements.length;

    // 0%の項目は表示しないようにフィルタリング
    const filteredLabels: Status[] = [];
    const filteredData: number[] = [];
    const filteredBackgroundColors: string[] = [];
    const filteredBorderColors: string[] = [];

    const statusColors: { [key in Status]: string } = {
      '達成': '#28a745', // green
      '未達成': '#dc3545', // red
      '一部達成': '#ffc107', // yellow
      '該当なし': '#6c757d', // gray
      '未評価': '#f8f9fa', // light gray
    };

    (Object.keys(statusCounts) as Status[]).forEach(status => {
      const count = statusCounts[status] || 0;
      if (count > 0 || totalRequirements === 0) { // 0件の場合でもラベルは表示
        filteredLabels.push(status);
        filteredData.push(count);
        filteredBackgroundColors.push(statusColors[status]);
        filteredBorderColors.push('#ffffff');
      }
    });

    const data = { // 凡例は元の状態に戻すため、ラベルからパーセンテージ表示を削除
      labels: filteredLabels,
      datasets: [
        {
          data: filteredData,
          backgroundColor: filteredBackgroundColors,
          borderColor: filteredBorderColors,
          borderWidth: 1,
        },
      ],
    };

    const options: ChartOptions<'pie'> = { // datalabelsプラグインの設定を追加
      responsive: true,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: '評価ステータス別サマリー',
        },
        datalabels: { // datalabelsプラグインの設定
          color: '#000', // 文字色を黒に変更
          formatter: (value, context) => {
            const total = (context.chart.data.datasets[0].data as number[]).reduce((sum: number, current: number) => sum + current, 0); // datasets[0].dataをnumber[]にキャスト
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${percentage}%`;
          },
          font: {
            weight: 'bold',
            size: 14,
          },
          display: (context) => { // 0%のデータは表示しない
            const value = context.dataset.data[context.dataIndex] as number;
            return value > 0;
          }
        },
        tooltip: {
          callbacks: {
            label: function(context: any) { // contextにany型を明示的に指定
              const label = context.label || '';
              const value = context.raw as number;
              const percentage = totalRequirements > 0 ? ((value / totalRequirements) * 100).toFixed(1) : '0.0';
              return `${label}: ${value}件 (${percentage}%)`;
            }
          }
        }
      },
      animation: { // アニメーションを無効にする
        animateScale: false,
        animateRotate: false,
      },
    };

    const plugins: Plugin<'pie'>[] = [ChartDataLabels]; // datalabelsプラグインを登録

    return { data, options, plugins };
  }, [requirements]);

  return (
    <div className="card mt-4" id={id}>
      <div 
        className="card-header bg-primary text-white d-flex justify-content-between align-items-center"
        onClick={() => setIsCollapsed(!isCollapsed)} // ヘッダー全体をクリック可能に
        style={{ cursor: 'pointer' }} // カーソルをポインターに
        aria-expanded={!isCollapsed}
        aria-controls="dashboard-collapse-body"
      >
        <h2 className="mb-0">ダッシュボード</h2>
        <span className="ms-auto"> {/* アイコンを右寄せ */}
          {isCollapsed ? 'V' : '^'} {/* ^とVで切り替え */}
        </span>
      </div>
      <div className={`card-body collapse ${!isCollapsed ? 'show' : ''}`} id="dashboard-collapse-body">
        {requirements.length === 0 ? (
          <p>表示するデータがありません。</p>
        ) : (
          <div style={{ maxWidth: '500px', margin: 'auto' }}>
            <Pie data={chartData.data} options={chartData.options} plugins={chartData.plugins} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;