import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { fetchBlocksForLookup, findBlockForDate } from './blockLookup';

const STATUS_STYLE = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-green-100 text-green-700',
  denied:    'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function RequestList({ residentId, refreshKey }) {
  const [requests, setRequests] = useState([]);
  const [blocks, setBlocks] = useState([]);

  async function load() {
    const [{ data }, blockData] = await Promise.all([
      supabase.from('day_off_requests').select('*').eq('resident_id', residentId).order('submitted_at', { ascending: false }),
      fetchBlocksForLookup(),
    ]);
    setRequests(data || []);
    setBlocks(blockData);
  }

  useEffect(() => { load(); }, [residentId, refreshKey]);

  async function cancel(id) {
    await supabase.from('day_off_requests').update({ status: 'cancelled' }).eq('id', id);
    load();
  }

  function blockLabelFor(req) {
    const block = req.dates.length ? findBlockForDate(req.dates[0], blocks) : null;
    return block ? block.name : 'Not yet scheduled';
  }

  if (requests.length === 0) {
    return <p className="text-sm text-gray-400">No requests submitted yet.</p>;
  }

  return (
    <div className="space-y-2">
      {requests.map(req => (
        <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{blockLabelFor(req)}</p>
              <p className="text-sm font-medium text-gray-800">{req.dates.join(', ')}</p>
              {req.reason && <p className="text-xs text-gray-500 mt-1">"{req.reason}"</p>}
              {req.decision_note && <p className="text-xs text-gray-500 mt-1">Chief's note: "{req.decision_note}"</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[req.status]}`}>{req.status}</span>
              {req.status === 'pending' && (
                <button onClick={() => cancel(req.id)} title="Withdraw request" className="text-gray-300 hover:text-red-500">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
