export default function ChangeTable({ data, onCommit }) {
  if (!data || data.length === 0) return <p>No changes</p>;

  return (
    <div className="bg-white p-6 rounded shadow">
      <table className="w-full">
        <thead>
          <tr className="text-left text-gray-400 text-sm">
            <th>Plant</th>
            <th>Unit</th>
            <th>Capacity</th>
            <th>Type</th>
            <th>Changed Fields</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-t">
              <td>{row.Generating_Station_Name}</td>
              <td>{row.Unit_Name}</td>
              <td>{row.installed_capacity}</td>

              <td>
                <span
                  className={
                    row.change_type === "NEW"
                      ? "text-green-600"
                      : "text-orange-600"
                  }
                >
                  {row.change_type}
                </span>
              </td>

              <td>
                {row.changed_fields?.map((f, i) => (
                  <span
                    key={i}
                    className="bg-red-100 text-red-600 px-2 py-1 mr-1 rounded text-xs"
                  >
                    {f}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={() => onCommit(data)}
        className="mt-6 bg-green-600 text-white px-4 py-2 rounded"
      >
        Commit Changes
      </button>
    </div>
  );
}