import { useEffect, useState } from "react";
import api, { BASE_URL } from "./api";

import { OrganizationChart } from "primereact/organizationchart";

import "primereact/resources/themes/lara-light-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

import { Box, Typography } from "@mui/material";

export default function DepartmentChart() {

  const [data, setData] = useState([]);

  useEffect(() => {
    fetchOrg();
  }, []);

  // =========================
  // FETCH DATA
  // =========================
  const fetchOrg = async () => {

    const res = await api.get("/roster/employees/org-tree");

    // ðŸ”¥ FIX IMAGE URL
    const formatTree = (nodes) => {
      return (nodes || [])
        .filter(n => n && n.data)   // ðŸ”¥ REMOVE NULL / BROKEN NODES
        .map(n => ({
          ...n,
          expanded: n.expanded ?? true,  // ðŸ”¥ ensure expanded exists
          data: {
            ...n.data,
            image: n.data.image
              ? `${BASE_URL}${n.data.image}`
              : "/default-avatar.png"
          },
          children: formatTree(n.children) // ðŸ”¥ recursive safe call
        }));
    };

    setData(formatTree(res.data || []));
  };

  // =========================
  // NODE TEMPLATE
  // =========================
  const nodeTemplate = (node) => {

    if (node.type === "person") {

      return (
        <div style={{
          textAlign: "center",
          padding: "10px",
          borderRadius: "12px",
          background: "#ffffff",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          minWidth: "140px"
        }}>

          <img
            alt={node.data.name}
            src={node.data.image}
            style={{
              width: "50px",
              height: "50px",
              borderRadius: "50%",
              marginBottom: "6px"
            }}
          />

          <div style={{ fontWeight: "bold", fontSize: "13px" }}>
            {node.data.name}
          </div>

          <div style={{ fontSize: "11px", color: "#666" }}>
            {node.data.title}
          </div>

        </div>
      );
    }

    return node.label;
  };

  return (
    <Box p={2}>

      <Typography variant="h5" mb={2}>
        Organizational Chart
      </Typography>

      <div style={{ overflowX: "auto" }}>
        {data.length > 0 && (
  <OrganizationChart
            value={data}
            nodeTemplate={nodeTemplate}
          />
        )}
      </div>

    </Box>
  );
}

