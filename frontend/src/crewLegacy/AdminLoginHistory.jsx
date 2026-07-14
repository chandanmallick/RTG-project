import React, { useEffect, useState } from "react";
import api from "./api";

import {
  Box,
  Paper,
  Typography,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Grid
} from "@mui/material";


export default function AdminLoginHistory(){

  const [data,setData] = useState([])
  const [summary,setSummary] = useState({})
  const [startDate,setStartDate] = useState("")
  const [endDate,setEndDate] = useState("")

  const fetchData = async () => {

    const res = await api.get("/auth/admin/login-history", {
            params:{ startDate, endDate }
        })

        setData(res.data)

        const sum = await api.get("/auth/admin/login-summary", {
            params:{ startDate, endDate }
        })

        setSummary(sum.data)
    }

  useEffect(()=>{
    fetchData()
  },[])

  useEffect(() => {

    const today = new Date().toISOString().split("T")[0]

    setStartDate(today)
    setEndDate(today)}, [])

  return(

    <Box sx={{p:3}}>

      <Paper sx={{p:3, borderRadius:4}}>

        <Typography variant="h6" fontWeight="bold">
          Login Audit
        </Typography>

        <Divider sx={{my:2}}/>

        <Box sx={{display:"flex", gap:2, mb:2}}>

            <input
                type="date"
                value={startDate}
                onChange={(e)=>setStartDate(e.target.value)}
            />

            <input
                type="date"
                value={endDate}
                onChange={(e)=>setEndDate(e.target.value)}
            />

            <button onClick={fetchData}>
                Filter
            </button>

        </Box>

        <Grid container spacing={2} mb={2}>

            {/* TOTAL */}
            <Grid item xs={12} md={3}>
                <Paper sx={{
                p:2,
                borderRadius:3,
                background:"linear-gradient(135deg,#42a5f5,#478ed1)",
                color:"#fff"
                }}>
                <Typography>Total Logins</Typography>
                <Typography variant="h5">{summary.total || 0}</Typography>
                </Paper>
            </Grid>

            {/* SUCCESS */}
            <Grid item xs={12} md={3}>
                <Paper sx={{
                p:2,
                borderRadius:3,
                background:"linear-gradient(135deg,#66bb6a,#43a047)",
                color:"#fff"
                }}>
                <Typography>Success</Typography>
                <Typography variant="h5">{summary.success || 0}</Typography>
                </Paper>
            </Grid>

            {/* FAILED */}
            <Grid item xs={12} md={3}>
                <Paper sx={{
                p:2,
                borderRadius:3,
                background:"linear-gradient(135deg,#ef5350,#e53935)",
                color:"#fff"
                }}>
                <Typography>Failed</Typography>
                <Typography variant="h5">{summary.failed || 0}</Typography>
                </Paper>
            </Grid>

            {/* ACTIVE */}
            <Grid item xs={12} md={3}>
                <Paper sx={{
                p:2,
                borderRadius:3,
                background:"linear-gradient(135deg,#ab47bc,#8e24aa)",
                color:"#fff"
                }}>
                <Typography>Active Sessions</Typography>
                <Typography variant="h5">{summary.active || 0}</Typography>
                </Paper>
            </Grid>

        </Grid>

        <Table>

          <TableHead>
            <TableRow sx={{background:"#263238"}}>

              <TableCell sx={{color:"#fff"}}>User</TableCell>
              <TableCell sx={{color:"#fff"}}>Role</TableCell>
              <TableCell sx={{color:"#fff"}}>Login Time</TableCell>
              <TableCell sx={{color:"#fff"}}>Status</TableCell>
              <TableCell sx={{color:"#fff"}}>IP</TableCell>
              <TableCell sx={{color:"#fff"}}>Logout</TableCell>

            </TableRow>
          </TableHead>

          <TableBody>

            {data.map((d,i)=>(

              <TableRow key={i} hover>

                <TableCell>
                  {d.name || d.employeeId}
                </TableCell>

                <TableCell>
                  {d.role || "-"}
                </TableCell>

                <TableCell>
                  {d.loginTime
                    ? new Date(d.loginTime).toLocaleString()
                    : "-"
                  }
                </TableCell>

                <TableCell>

                  <Chip
                    label={d.status}
                    size="small"
                    sx={{
                      background:
                        d.status === "Success"
                          ? "#4caf50"
                          : "#e53935",
                      color:"#fff"
                    }}
                  />

                </TableCell>

                <TableCell>
                  {d.ip || "-"}
                </TableCell>

                <TableCell>
                {d.logoutTime
                    ? new Date(d.logoutTime).toLocaleString()
                    : "Active"}
                </TableCell>

              </TableRow>

            ))}

          </TableBody>

        </Table>

      </Paper>

    </Box>

  )
}
