export default function Header({ fetchChanges, loading }) {
  return (
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-2xl font-bold">Database Sync</h2>

      <button
        onClick={fetchChanges}
        className="bg-indigo-600 text-white px-4 py-2 rounded shadow"
      >
        {loading ? "Loading..." : "Fetch & Compare"}
      </button>
    </div>
  );
}