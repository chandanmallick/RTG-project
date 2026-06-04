import { useState } from 'react';

export const useSyncData = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchChanges = async () => {
    setLoading(true);
    // Call your FastAPI /api/check-changes endpoint
    const res = await fetch(`http://${window.location.hostname}:8001/api/check-changes`);
    const result = await res.json();
    setData(result.changes);
    setLoading(false);
  };

  const commitChanges = async () => {
    setLoading(true);
    await fetch(`http://${window.location.hostname}:8001/api/commit-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setData([]);
    setLoading(false);
    alert("Database Updated Successfully!");
  };

  return { data, loading, fetchChanges, commitChanges };
};