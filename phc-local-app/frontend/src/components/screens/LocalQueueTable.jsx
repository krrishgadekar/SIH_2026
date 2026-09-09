import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { localApi } from '../../api/localApiClient';

export const LocalQueueTable = () => {
  const { t } = useTranslation();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const data = await localApi.getQueue();
        setQueue(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchQueue();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'quality_passed':
        return <span className="badge badge--neutral">{t('queue.statusPass')}</span>;
      case 'synced':
        return <span className="badge badge--neutral" style={{ color: '#4D90FE', borderColor: '#4D90FE'}}>{t('queue.statusSynced')}</span>;
      case 'result_pending':
        return <span className="badge badge--warning">{t('queue.statusPending')}</span>;
      case 'result_delivered':
        return <span className="badge badge--pass">{t('queue.statusReady')}</span>;
      case 'captured':
      default:
        return <span className="badge" style={{ borderColor: 'rgba(230,26,60,0.3)', color: 'rgba(230,26,60,0.5)' }}>{t('queue.statusCaptured')}</span>;
    }
  };

  return (
    <div className="section">
      <div className="u-flex u-justify-between u-items-center u-mb-6">
        <h1 className="t-h1">{t('queue.title')}</h1>
        <div className="t-mono" style={{ opacity: 0.6 }}>
          {queue.length} {t('queue.items')}
        </div>
      </div>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>{t('queue.colId')}</th>
              <th>{t('queue.colPatient')}</th>
              <th>{t('queue.colCaptured')}</th>
              <th>{t('queue.colStatus')}</th>
              <th>{t('queue.colAction')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4].map(i => (
                <tr key={i}>
                  <td colSpan="5">
                    <div className="skeleton" style={{ height: '24px', width: '100%' }}></div>
                  </td>
                </tr>
              ))
            ) : queue.length === 0 ? (
              <tr>
                <td colSpan="5" className="u-text-center u-p-6">
                  <span className="t-mono" style={{ opacity: 0.5 }}>{t('queue.empty')}</span>
                </td>
              </tr>
            ) : (
              queue.map(item => (
                <tr key={item.captureId} className="clickable">
                  <td><span className="t-mono" style={{ opacity: 0.8 }}>{item.captureId.split('-')[1]}</span></td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{item.patientName}</div>
                    <div className="t-mono" style={{ fontSize: '10px', opacity: 0.5 }}>{item.patientId}</div>
                  </td>
                  <td>{new Date(item.capturedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    {item.status === 'result_delivered' ? (
                      <button className="btn btn--outline" style={{ padding: '4px 8px', fontSize: '10px' }}>{t('queue.btnView')}</button>
                    ) : (
                      <span className="t-mono" style={{ fontSize: '10px', opacity: 0.3 }}>{t('queue.txtWaiting')}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
