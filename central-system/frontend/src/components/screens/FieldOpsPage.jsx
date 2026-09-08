import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { InfoBanner } from '../shared/InfoBanner';

const SortHeader = ({ label, sortKey, currentSort, onRequestSort, width }) => {
  const active = currentSort.key === sortKey;
  const direction = currentSort.direction;
  
  return (
    <th onClick={() => onRequestSort(sortKey)} style={{ cursor: 'pointer', userSelect: 'none', width: width, transition: 'background 0.2s' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
        {label}
        <svg 
          width="16" height="16" viewBox="0 0 24 24" 
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ 
            marginLeft: '6px', 
            opacity: active ? 1 : 0.3,
            transition: 'opacity 0.2s',
          }}
        >
          <g style={{ opacity: active && direction === 'asc' ? 1 : (active ? 0.3 : 0.7) }}>
            <path d="M8 18V6M4 10l4-4 4 4" />
          </g>
          <g style={{ opacity: active && direction === 'desc' ? 1 : (active ? 0.3 : 0.7) }}>
            <path d="M16 6v12M12 14l4 4 4-4" />
          </g>
        </svg>
      </div>
    </th>
  );
};

const mockPhcData = [
  { id: 'PHC-001', name: 'Pune Rural Health Centre', qualityRate: 0.92, cameraUnit: 'REMIDIO-FOP-X1', technician: 'Rahul K.', casesSubmitted: 145, casesFlagged: 12 },
  { id: 'PHC-002', name: 'Baramati District Clinic', qualityRate: 0.85, cameraUnit: 'FORUS-3Nethra', technician: 'Priya M.', casesSubmitted: 89, casesFlagged: 24 },
  { id: 'PHC-003', name: 'Shirur Mobile Camp', qualityRate: 0.78, cameraUnit: 'REMIDIO-FOP-X1', technician: 'Sunil D.', casesSubmitted: 210, casesFlagged: 45 },
  { id: 'PHC-004', name: 'Junnar Sub-Center', qualityRate: 0.95, cameraUnit: 'VOLK-iNview', technician: 'Meera V.', casesSubmitted: 56, casesFlagged: 3 },
  { id: 'PHC-005', name: 'Daund Main Hospital', qualityRate: 0.88, cameraUnit: 'FORUS-3Nethra', technician: 'Amit R.', casesSubmitted: 302, casesFlagged: 38 },
];

export const FieldOpsPage = () => {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'casesSubmitted', direction: 'desc' });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedData = useMemo(() => {
    let data = mockPhcData.filter(phc => 
      phc.name.toLowerCase().includes(filterText.toLowerCase()) || 
      phc.technician.toLowerCase().includes(filterText.toLowerCase())
    );

    if (sortConfig.key) {
      data.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [filterText, sortConfig]);

  return (
    <div className="section">
      <div className="u-flex u-items-center u-justify-between u-mb-6">
        <div>
          <h1 className="t-h1 u-mb-2">FIELD OPS</h1>
          <div className="t-mono" style={{ opacity: 0.8 }}>
            PHC PERFORMANCE & QUALITY OVERSIGHT
          </div>
        </div>
        <div>
          <input 
            type="text" 
            placeholder="Search PHC or Technician..." 
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ 
              padding: '12px 16px', 
              background: 'transparent', 
              border: '1px solid var(--c-crimson)', 
              color: 'var(--text-h)', 
              fontFamily: 'var(--font-mono)',
              width: '300px',
              outline: 'none'
            }} 
          />
        </div>
      </div>

      <InfoBanner 
        title="PHC OVERSIGHT" 
        text="Monitor aggregate quality metrics across deployed sites. Search by PHC or technician to isolate low-performing units. Click on any row to instantly filter your Review Queue to that specific center." 
      />

      <div style={{ border: 'var(--border)' }}>
        <table className="table">
          <thead>
            <tr>
              <SortHeader label="PHC NAME" sortKey="name" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="TECHNICIAN" sortKey="technician" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="CAMERA UNIT" sortKey="cameraUnit" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="CASES SUBMITTED" sortKey="casesSubmitted" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="CASES FLAGGED" sortKey="casesFlagged" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="IMAGE QUALITY" sortKey="qualityRate" currentSort={sortConfig} onRequestSort={requestSort} />
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedData.map((phc) => {
              const qualityPct = Math.round(phc.qualityRate * 100);
              const qualityClass = qualityPct < 80 ? 'var(--c-danger)' : qualityPct < 90 ? 'var(--c-warning)' : 'var(--c-success)';
              
              return (
                <tr 
                  key={phc.id} 
                  className="clickable"
                  onClick={() => navigate(`/ophth/queue?phc=${phc.id}`)}
                >
                  <td>
                    <span className="t-mono" style={{ fontWeight: 700 }}>{phc.name}</span><br />
                    <span className="t-label" style={{ opacity: 0.5 }}>{phc.id}</span>
                  </td>
                  <td className="t-mono">{phc.technician}</td>
                  <td className="t-mono" style={{ fontSize: '12px', opacity: 0.8 }}>{phc.cameraUnit}</td>
                  <td className="t-mono" style={{ fontWeight: 700 }}>{phc.casesSubmitted}</td>
                  <td className="t-mono">
                    <span style={{ color: phc.casesFlagged > 20 ? 'var(--c-danger)' : 'inherit' }}>
                      {phc.casesFlagged}
                    </span>
                  </td>
                  <td>
                    <div className="u-flex u-items-center u-gap-2" style={{ minWidth: '120px' }}>
                      <div className="bar" style={{ flex: 1 }}>
                        <div className="bar__fill" style={{ width: `${qualityPct}%`, background: qualityClass }} />
                      </div>
                      <span className="t-mono" style={{ fontSize: 'var(--fs-tiny)', minWidth: '32px', color: qualityClass }}>
                        {qualityPct}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filteredAndSortedData.length === 0 && (
        <div className="u-text-center u-p-6" style={{ border: 'var(--border)', borderTop: 'none' }}>
          <p className="t-mono" style={{ opacity: 0.4 }}>NO PHCS FOUND</p>
        </div>
      )}
    </div>
  );
};
