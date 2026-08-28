import React, { useState, useEffect } from "react"
import api from "./api"
import { useMemo } from "react"

import {
Box,
Typography,
Paper,
Grid,
TextField,
Button,
Table,
TableHead,
TableRow,
TableCell,
TableBody,
MenuItem,
Collapse,
IconButton,
Checkbox,
Dialog,
DialogTitle,
DialogContent,
DialogActions,
Accordion,
AccordionSummary,
AccordionDetails,
Alert,
Chip,
CircularProgress,
Stack,
} from "@mui/material"

import { ExpandLess, ExpandMore  } from "@mui/icons-material"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useAuth } from "../auth/AuthContext";

export default function TrainingHolidayMaster(){
const { user } = useAuth()
const trainingAccess = user?.permissions?.crew_training || {}
const canViewTrainingPage = Boolean(trainingAccess.view)
const canManageTraining = Boolean(trainingAccess.write)

/* ================= BASIC VARIABLES ================= */

const currentYear = new Date().getFullYear()

const generateYears = ()=>{
let years=[]
for(let i=currentYear-2;i<=currentYear+5;i++){
years.push(i)
}
return years
}

const generateFY = ()=>{
let list=[]
for(let i=currentYear-2;i<=currentYear+5;i++){
list.push(`${i}-${(i+1).toString().slice(2)}`)
}
return list
}

const years = generateYears()
const financialYears = generateFY()

/* ================= STATES ================= */

const [holidayOpen,setHolidayOpen]=useState(true)
const [trainingOpen,setTrainingOpen]=useState(true)
const [assignOpen,setAssignOpen]=useState(true)

const [selectedYear,setSelectedYear]=useState(currentYear)
const [selectedFY,setSelectedFY]=useState(financialYears[2])

const [holidayList,setHolidayList]=useState([])
const [trainingList,setTrainingList]=useState([])
const [editingTrainingId,setEditingTrainingId]=useState("")

const [holiday,setHoliday]=useState({
date:"",
holidayName:"",
holidayNameHindi:""
})

const [training,setTraining]=useState({
trainingName:"",
trainingNameHindi:"",
location:"",
startDate:"",
endDate:""
})

const [holidayDate, setHolidayDate] = useState(null);

/* ================= ASSIGN ================= */

const [selectedTraining,setSelectedTraining]=useState("")
const [calendarOpen,setCalendarOpen]=useState(false)
const [calendarData,setCalendarData]=useState({})
const [calendarDates,setCalendarDates]=useState([])

const [selectedEmployees,setSelectedEmployees]=useState([])
const [employeeTypeFilter,setEmployeeTypeFilter]=useState("All")

/* ================= APPROVAL ================= */

const [pendingList,setPendingList]=useState([])
const [selectedRows,setSelectedRows]=useState([])
const [replacementChoices,setReplacementChoices]=useState({})
const [replacementCandidates,setReplacementCandidates]=useState({})
const [candidateLoading,setCandidateLoading]=useState({})
const [expandedApprovalId,setExpandedApprovalId]=useState("")

/* ================= HISTORY ================= */

const [history,setHistory]=useState([])
const [historyFY,setHistoryFY]=useState("")
const [historyEmployee,setHistoryEmployee]=useState("")
const [historyView,setHistoryView]=useState("history")
const [matrixStatus,setMatrixStatus]=useState("All")
const [myApprovedTraining,setMyApprovedTraining]=useState([])
const [myOffChoices,setMyOffChoices]=useState({})
const [notice,setNotice]=useState(null)
const [activeSection,setActiveSection]=useState(()=>new URLSearchParams(window.location.search).get("section") || null)
const selectedApprovalDetail = pendingList.find((row)=>row.id===expandedApprovalId)

const openSection=(section)=>{
setActiveSection(section)
window.setTimeout(()=>{
document.getElementById(`training-workspace-${section}`)?.scrollIntoView({behavior:"smooth",block:"start"})
},180)
}

/* ================= FETCH HOLIDAY ================= */

const fetchHoliday = async ()=>{
try{
const res = await api.get(`/Training_holiday/holiday/${selectedYear}`)
setHolidayList(res.data || [])
}catch(err){
console.error(err)
}
}

useEffect(()=>{
if(canViewTrainingPage) fetchHoliday()
},[selectedYear,canViewTrainingPage])

/* ================= SAVE HOLIDAY ================= */

const saveHoliday = async()=>{
try{

await api.post(`/Training_holiday/holiday`,{
...holiday,
year:selectedYear
})

setHoliday({
date:"",
holidayName:"",
holidayNameHindi:""
})

fetchHoliday()

}catch(err){
console.error(err)
}
}

/* ================= FETCH TRAINING ================= */

const fetchTraining = async()=>{
try{

const res = await api.get(`/Training_holiday/training/${selectedFY}`)

setTrainingList(res.data || [])

}catch(err){
console.error(err)
}
}

useEffect(()=>{
if(canViewTrainingPage) fetchTraining()
},[selectedFY,canViewTrainingPage])

/* ================= SAVE TRAINING ================= */

const saveTraining = async()=>{

try{

const payload={...training,financialYear:selectedFY}
if(editingTrainingId){
await api.put(`/Training_holiday/training/${editingTrainingId}`,payload)
}else{
await api.post(`/Training_holiday/training`,payload)
}

setTraining({
trainingName:"",
trainingNameHindi:"",
location:"",
startDate:"",
endDate:""
})
setEditingTrainingId("")
setNotice({severity:"success",text:editingTrainingId ? "Training dates and location updated." : "Training programme added."})

fetchTraining()

}catch(err){
console.error(err)
}

}

const editTraining=(item)=>{
setTraining({
trainingName:item.trainingName || "",
trainingNameHindi:item.trainingNameHindi || "",
location:item.location || "",
startDate:item.startDate || "",
endDate:item.endDate || ""
})
setEditingTrainingId(item.id)
}

const cancelTrainingEdit=()=>{
setEditingTrainingId("")
setTraining({trainingName:"",trainingNameHindi:"",location:"",startDate:"",endDate:""})
}

/* ================= DUTY MATRIX ================= */

const generateDates=(start,end)=>{

let list=[]

let s=new Date(start)
let e=new Date(end)

s.setDate(s.getDate()-1)
e.setDate(e.getDate()+1)

while(s<=e){
list.push(s.toISOString().split("T")[0])
s.setDate(s.getDate()+1)
}

return list

}

const fetchCalendarDuty = async(trainingName, fallbackStartDate = "", fallbackEndDate = "")=>{

const trainingObj = trainingList.find(
t=>t.trainingName===trainingName
 ) || (fallbackStartDate ? {
  trainingName,
  startDate: fallbackStartDate,
  endDate: fallbackEndDate || fallbackStartDate
 } : null)

if(!trainingObj) return

const res = await api.get(
`/training-assign/calendar/${trainingObj.startDate}/${trainingObj.endDate}`
)

setCalendarData(res.data)
setCalendarDates(generateDates(trainingObj.startDate,trainingObj.endDate))
setSelectedEmployees([])
setEmployeeTypeFilter("All")

setCalendarOpen(true)

}

/* ================= NOMINATE ================= */

const nominateTraining = async()=>{

try{

const trainingObj = trainingList.find(
t=>t.trainingName===selectedTraining
)

await api.post("/training-assign/nominate",{
date:trainingObj.startDate,
startDate:trainingObj.startDate,
endDate:trainingObj.endDate,
trainingName:selectedTraining,
trainingLocation:trainingObj.location || "",
employees:selectedEmployees
})

setCalendarOpen(false)
setSelectedEmployees([])
setNotice({severity:"success",text:"Training nomination sent through each employee's reporting hierarchy."})

fetchPending()
fetchHistory()

}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || err?.message || "Training nomination could not be saved."})
}

}

/* ================= PENDING ================= */

const fetchPending = async()=>{

try{

const res = await api.get("/training-assign/pending")

const rows=res.data || []
setPendingList(rows)
setReplacementChoices((current)=>{
const next={}
rows.forEach((row)=>{
next[row.id]=current[row.id] || {
replacementRequired:Boolean(row.replacementRequired),
replacementEmployeeId:row.replacementEmployee?.employeeId || "",
assignActingSIC:Boolean(row.actingSICEmployee?.employeeId),
actingSICEmployeeId:row.actingSICEmployee?.employeeId || ""
}
})
return next
})

}catch(err){
console.error(err)
}

}

useEffect(()=>{
fetchPending()
},[])

const loadReplacementCandidates = async(row)=>{
if(replacementCandidates[row.id] || candidateLoading[row.id]) return
setCandidateLoading((current)=>({...current,[row.id]:true}))
try{
const res=await api.get(`/training-assign/replacement-candidates/${row.id}`)
setReplacementCandidates((current)=>({...current,[row.id]:res.data?.candidates || []}))
}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || "Replacement candidates could not be loaded."})
}finally{
setCandidateLoading((current)=>({...current,[row.id]:false}))
}
}

const updateReplacementChoice=(row,field,value)=>{
setReplacementChoices((current)=>({
...current,
[row.id]:{
replacementRequired:false,
replacementEmployeeId:"",
assignActingSIC:false,
actingSICEmployeeId:"",
...(current[row.id] || {}),
[field]:value
}
}))
}

/* ================= APPROVE ================= */

const approveTraining = async()=>{

try{
await api.post("/training-assign/approve",{
ids:selectedRows,
replacementDecisions:selectedRows.map((id)=>({id,...(replacementChoices[id] || {})}))
})
setSelectedRows([])
setNotice({severity:"success",text:"Selected nominations approved and forwarded to the next reporting authority."})
await Promise.all([fetchPending(),fetchHistory()])
}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || err?.message || "Training approval could not be completed."})
}

}

/* ================= FINALIZE ================= */

const finalizeTraining = async()=>{

await api.post("/training-assign/finalize",{
ids:selectedRows,
user:"Admin"
})

fetchPending()

}

/* ================= HISTORY ================= */

const fetchHistory = async()=>{

const res = await api.get("/training-assign/history",{
params:{
financialYear:historyFY,
employeeId:historyEmployee
}
})

setHistory(res.data || [])

}

useEffect(()=>{
if(canViewTrainingPage) fetchHistory()
},[historyFY,historyEmployee,canViewTrainingPage])

const trainingHistory=useMemo(()=>(history || []).filter((row)=>(row.workflowKind || "Training")==="Training"),[history])

const matrixStatuses=useMemo(()=>Array.from(new Set(trainingHistory.map((row)=>row.status).filter(Boolean))).sort(),[trainingHistory])

const nominationMatrix=useMemo(()=>{
const rows=matrixStatus==="All" ? trainingHistory : trainingHistory.filter((row)=>row.status===matrixStatus)
const programmes=Array.from(new Set(rows.map((row)=>row.trainingName || "Unnamed training"))).sort((a,b)=>a.localeCompare(b))
const employees=new Map()

const duration=(row)=>{
const start=new Date(`${row.startDate || row.trainingDate}T00:00:00Z`)
const end=new Date(`${row.endDate || row.startDate || row.trainingDate}T00:00:00Z`)
if(Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
return Math.max(1,Math.floor((end-start)/86400000)+1)
}

rows.forEach((row)=>{
const employeeKey=row.employeeId || row.employeeName || "Unknown employee"
if(!employees.has(employeeKey)) employees.set(employeeKey,{
employeeId:row.employeeId || "-",
employeeName:row.employeeName || row.employeeId || "Unknown employee",
designation:row.employeeDesignation || "-",
employeeType:row.employeeType || "-",
groupName:row.groupName || "-",
cells:{},total:0,approved:0,pending:0,rejected:0,approvedDays:0,
})
const employee=employees.get(employeeKey)
const programme=row.trainingName || "Unnamed training"
employee.cells[programme]=[...(employee.cells[programme] || []),row]
employee.total+=1
if(row.status==="Approved"){
employee.approved+=1
employee.approvedDays+=duration(row)
}else if(["Rejected","Cancelled"].includes(row.status)) employee.rejected+=1
else employee.pending+=1
})

return {
programmes,
employees:Array.from(employees.values()).sort((a,b)=>a.employeeName.localeCompare(b.employeeName)),
nominationCount:rows.length,
approvedCount:rows.filter((row)=>row.status==="Approved").length,
}
},[trainingHistory,matrixStatus])

const statusChipSx=(status)=>{
if(status==="Approved") return {background:"#DCFCE7",color:"#166534",border:"1px solid #86EFAC"}
if(["Rejected","Cancelled"].includes(status)) return {background:"#FEE2E2",color:"#991B1B",border:"1px solid #FCA5A5"}
return {background:"#FFF7ED",color:"#9A3412",border:"1px solid #FDBA74"}
}

const exportNominationMatrix=()=>{
const csvCell=(value)=>`"${String(value ?? "").replace(/"/g,'""')}"`
const columns=["Employee ID","Employee Name","Designation","Employee Type","Group",...nominationMatrix.programmes,"Total Nominations","Approved","Pending","Rejected / Cancelled","Approved Training Days"]
const lines=[columns.map(csvCell).join(",")]
nominationMatrix.employees.forEach((employee)=>{
const programmeCells=nominationMatrix.programmes.map((programme)=>(employee.cells[programme] || []).map((item)=>{
const period=item.startDate===item.endDate || !item.endDate ? item.startDate || item.trainingDate : `${item.startDate} to ${item.endDate}`
return `${item.status} (${period})`
}).join("; "))
lines.push([
employee.employeeId,employee.employeeName,employee.designation,employee.employeeType,employee.groupName,
...programmeCells,employee.total,employee.approved,employee.pending,employee.rejected,employee.approvedDays,
].map(csvCell).join(","))
})
const blob=new Blob([`\uFEFF${lines.join("\r\n")}`],{type:"text/csv;charset=utf-8"})
const url=URL.createObjectURL(blob)
const link=document.createElement("a")
link.href=url
link.download=`training_nomination_matrix_${historyFY || "all"}.csv`
document.body.appendChild(link)
link.click()
link.remove()
URL.revokeObjectURL(url)
}

const fetchMyApprovedTraining=async()=>{
try{
const res=await api.get("/training-assign/my-approved")
setMyApprovedTraining(res.data || [])
}catch(err){
console.error(err)
}
}

useEffect(()=>{
fetchMyApprovedTraining()
},[])

const requestAdjacentOff=async(row)=>{
const choice=myOffChoices[row.id] || {before:false,after:false}
try{
await api.post(`/training-assign/request-adjacent-off/${row.id}`,choice)
setNotice({severity:"success",text:"Adjacent OFF request sent through your reporting hierarchy."})
setMyOffChoices((current)=>({...current,[row.id]:{before:false,after:false}}))
await Promise.all([fetchMyApprovedTraining(),fetchPending()])
}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || err?.message || "Adjacent OFF request could not be submitted."})
}
}

/* ================= UI ================= */

return(

<Box sx={{p:3,background:"#f4f6fb",minHeight:"100vh"}}>

{/* HEADER */}

<Box sx={{p:3,mb:3,borderRadius:3,background:"linear-gradient(105deg,#08103A 0%,#0057B7 65%,#0F6FDB 100%)",color:"#FFFFFF"}}>
<Typography variant="h5" sx={{fontWeight:900,color:"#FFFFFF"}}>
{canViewTrainingPage ? "Training & Holiday Management" : "Training Approval Inbox"}
</Typography>
<Typography variant="body2" sx={{mt:.45,color:"rgba(255,255,255,.88)"}}>
Manage holiday masters, training programmes, nominations and approval workflows.
</Typography>
</Box>

{notice && <Alert severity={notice.severity} onClose={()=>setNotice(null)} sx={{mb:2}}>{notice.text}</Alert>}

<Grid container spacing={2} sx={{mb:3}}>
{[
...(canViewTrainingPage ? [
{key:"holiday",title:"Holiday Master",subtitle:"Maintain yearly holiday records",count:holidayList.length,color:"#0057B7",tint:"#EAF2FF"},
{key:"training",title:"Training Master",subtitle:"Maintain training programmes",count:trainingList.length,color:"#0F766E",tint:"#ECFDF5"},
] : []),
...(canManageTraining ? [{key:"assign",title:"Assign Training",subtitle:"Nominate eligible employees",count:null,color:"#17876D",tint:"#EAF8F3"}] : []),
{key:"mytraining",title:"My Approved Training",subtitle:"Request adjacent OFF after approval",count:myApprovedTraining.length,color:"#047857",tint:"#ECFDF5"},
{key:"pending",title:"Pending Approvals",subtitle:"Review and forward nominations",count:pendingList.length,color:"#D97706",tint:"#FFF7E8"},
...(canViewTrainingPage ? [{key:"history",title:"Nomination History",subtitle:"View history and nomination matrix",count:history.length,color:"#4338CA",tint:"#EEF2FF"}] : []),
].map((tile)=>(
<Grid item xs={12} sm={6} md={4} lg={canViewTrainingPage ? 2.4 : 4} key={tile.key}>
<Paper component="button" type="button" elevation={0} onClick={()=>openSection(tile.key)} sx={{width:"100%",minHeight:118,p:2.2,borderRadius:3,textAlign:"left",cursor:"pointer",border:`1px solid ${activeSection===tile.key ? tile.color : "#D7E3F4"}`,background:activeSection===tile.key ? tile.tint : "#FFFFFF",boxShadow:activeSection===tile.key ? `0 12px 28px ${tile.color}22` : "0 5px 18px rgba(15,23,42,.06)",transition:"transform .22s ease, box-shadow .22s ease, border-color .22s ease, background .22s ease","&:hover":{transform:"translateY(-3px)",borderColor:tile.color,boxShadow:`0 14px 30px ${tile.color}26`}}}>
<Box sx={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:2}}>
<Box><Typography sx={{color:"#0F172A",fontSize:16,fontWeight:950}}>{tile.title}</Typography><Typography sx={{mt:.65,color:"#64748B",fontSize:11.5,fontWeight:650}}>{tile.subtitle}</Typography></Box>
{tile.count!==null && <Box sx={{minWidth:42,height:42,px:1,borderRadius:2.2,display:"grid",placeItems:"center",color:"#FFFFFF",background:tile.color,fontSize:18,fontWeight:950}}>{tile.count}</Box>}
</Box>
<Typography sx={{mt:1.4,color:tile.color,fontSize:11.5,fontWeight:900}}>{activeSection===tile.key ? "Workspace open" : "Click to open"}</Typography>
</Paper>
</Grid>
))}
</Grid>

{/* ================= HOLIDAY ================= */}

<Collapse in={activeSection==="holiday"} timeout={420} unmountOnExit>
<Box id="training-workspace-holiday" sx={{scrollMarginTop:110}}>
{canViewTrainingPage && (
<Accordion
  defaultExpanded
  sx={{
    borderRadius: 3,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    overflow: "hidden",
    mb: 4
  }}
>

  {/* Header */}

  <AccordionSummary
    expandIcon={<ExpandMoreIcon />}
    sx={{
      background: "linear-gradient(90deg,#4f6df5,#6f86ff)",
      color: "white",
      px: 3
    }}
  >

    <Typography variant="h6" fontWeight={600}>
      Holiday Master
    </Typography>

  </AccordionSummary>

  {/* Body */}

  <AccordionDetails sx={{ backgroundColor: "#f8f9fc" }}>

    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 2,
        backgroundColor: "white"
      }}
    >

      {/* Form */}

      <Grid container spacing={2} alignItems="center">

        <Grid item xs={2}>

          <TextField
            select
            label="Year"
            disabled={!canManageTraining}
            fullWidth
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            {years.map((y) => (
              <MenuItem key={y} value={y}>
                {y}
              </MenuItem>
            ))}
          </TextField>

        </Grid>

        <Grid item xs={3}>

          <TextField
            type="date"
            disabled={!canManageTraining}
            fullWidth
            value={holiday.date}
            onChange={(e) =>
              setHoliday({ ...holiday, date: e.target.value })
            }
          />

        </Grid>

        <Grid item xs={3}>

          <TextField
            label="Holiday Name"
            disabled={!canManageTraining}
            fullWidth
            value={holiday.holidayName}
            onChange={(e) =>
              setHoliday({ ...holiday, holidayName: e.target.value })
            }
          />

        </Grid>

        <Grid item xs={3}>

          <TextField
            label="Hindi Name"
            disabled={!canManageTraining}
            fullWidth
            value={holiday.holidayNameHindi}
            onChange={(e) =>
              setHoliday({
                ...holiday,
                holidayNameHindi: e.target.value
              })
            }
          />

        </Grid>

        <Grid item xs={1}>

          <Button
            variant="contained"
            disabled={!canManageTraining}
            fullWidth
            sx={{
              height: 56,
              fontWeight: 600,
              borderRadius: 2
            }}
            onClick={saveHoliday}
          >
            ADD
          </Button>

        </Grid>

      </Grid>

      {/* Table */}

      <Table sx={{ mt: 4 }}>

        <TableHead>

          <TableRow
            sx={{
              backgroundColor: "#eef1ff"
            }}
          >

            <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Hindi</TableCell>

          </TableRow>

        </TableHead>

        <TableBody>

          {holidayList.map((h) => (

            <TableRow
              key={h.id}
              hover
              sx={{
                "&:nth-of-type(odd)": {
                  backgroundColor: "#fafbff"
                }
              }}
            >

              <TableCell>{h.date}</TableCell>
              <TableCell>{h.holidayName}</TableCell>
              <TableCell>{h.holidayNameHindi}</TableCell>

            </TableRow>

          ))}

        </TableBody>

      </Table>

    </Paper>

  </AccordionDetails>

</Accordion>
)}
</Box>
</Collapse>

{/* ================= TRAINING ================= */}

<Collapse in={activeSection==="training"} timeout={420} unmountOnExit>
<Box id="training-workspace-training" sx={{scrollMarginTop:110}}>
{canViewTrainingPage && (
<Accordion
  defaultExpanded
  sx={{
    borderRadius: 3,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    overflow: "hidden",
    mb: 4
  }}
>

  <AccordionSummary
    expandIcon={<ExpandMoreIcon />}
    sx={{
      background: "linear-gradient(90deg,#0ea5e9,#38bdf8)",
      color: "white",
      px: 3
    }}
  >
    <Typography variant="h6" fontWeight={600}>
      Training Master
    </Typography>
  </AccordionSummary>

  <AccordionDetails sx={{ backgroundColor: "#f8fbff" }}>

    <Paper elevation={0} sx={{ p: 3, borderRadius: 2 }}>

      <Grid container spacing={2} alignItems="center">

        <Grid item xs={12} md={2.5}>
          <TextField
            select
            label="Financial Year"
            fullWidth
            value={selectedFY}
            onChange={(e) => setSelectedFY(e.target.value)}
          >
            {financialYears.map((fy) => (
              <MenuItem key={fy} value={fy}>
                {fy}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        <Grid item xs={3}>
          <TextField
            label="Training"
            disabled={!canManageTraining}
            fullWidth
            value={training.trainingName}
            onChange={(e) =>
              setTraining({ ...training, trainingName: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={12} md={2.5}>
          <TextField
            label="Location"
            disabled={!canManageTraining}
            fullWidth
            value={training.location}
            onChange={(e) => setTraining({ ...training, location: e.target.value })}
          />
        </Grid>

        <Grid item xs={6} md={1.5}>
          <TextField
            type="date"
            label="Start date"
            InputLabelProps={{shrink:true}}
            disabled={!canManageTraining}
            fullWidth
            value={training.startDate}
            onChange={(e) =>
              setTraining({ ...training, startDate: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={6} md={1.5}>
          <TextField
            type="date"
            label="End date"
            InputLabelProps={{shrink:true}}
            disabled={!canManageTraining}
            fullWidth
            value={training.endDate}
            onChange={(e) =>
              setTraining({ ...training, endDate: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={12} md={1}>
          <Button
            variant="contained"
            disabled={!canManageTraining}
            fullWidth
            sx={{
              height: 56,
              borderRadius: 2,
              fontWeight: 600
            }}
            onClick={saveTraining}
          >
            {editingTrainingId ? "UPDATE" : "ADD"}
          </Button>
          {editingTrainingId && <Button size="small" fullWidth sx={{mt:.5}} onClick={cancelTrainingEdit}>Cancel</Button>}
        </Grid>

      </Grid>

      <Table sx={{ mt: 4 }}>

        <TableHead>
          <TableRow sx={{ backgroundColor: "#e0f2fe" }}>
            <TableCell sx={{ fontWeight: 600 }}>Training</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Location</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Start</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>End</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>

          {trainingList.map((t) => (

            <TableRow
              key={t.id}
              hover
              sx={{
                "&:nth-of-type(odd)": {
                  backgroundColor: "#f9fcff"
                }
              }}
            >

              <TableCell>{t.trainingName}</TableCell>
              <TableCell>{t.location || "-"}</TableCell>
              <TableCell>{t.startDate}</TableCell>
              <TableCell>{t.endDate}</TableCell>
              <TableCell><Button size="small" variant="outlined" disabled={!canManageTraining} onClick={()=>editTraining(t)}>Edit dates/location</Button></TableCell>

            </TableRow>

          ))}

        </TableBody>

      </Table>

    </Paper>

  </AccordionDetails>

</Accordion>
)}
</Box>
</Collapse>

{/* ================= ASSIGN ================= */}

<Collapse in={activeSection==="assign"} timeout={420} unmountOnExit>
<Box id="training-workspace-assign" sx={{scrollMarginTop:110}}>
{canManageTraining && (
<Accordion
  defaultExpanded
  sx={{
    borderRadius: 3,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    overflow: "hidden",
    mb: 4
  }}
>

  <AccordionSummary
    expandIcon={<ExpandMoreIcon />}
    sx={{
      background: "linear-gradient(90deg,#10b981,#34d399)",
      color: "white",
      px: 3
    }}
  >
    <Typography variant="h6" fontWeight={600}>
      Assign Training
    </Typography>
  </AccordionSummary>

  <AccordionDetails sx={{ backgroundColor: "#f7fffb" }}>

    <Paper elevation={0} sx={{ p: 3, borderRadius: 2 }}>

      <Grid container spacing={2} alignItems="center">

        <Grid item xs={4}>

          <TextField
            select
            label="Training Program"
            fullWidth
            value={selectedTraining}
            onChange={(e) => setSelectedTraining(e.target.value)}
          >

            {trainingList.map((t) => (

              <MenuItem key={t.id} value={t.trainingName}>
                {t.trainingName}
              </MenuItem>

            ))}

          </TextField>

        </Grid>

        <Grid item xs={2}>

          <Button
            variant="contained"
            sx={{
              height: 56,
              borderRadius: 2,
              fontWeight: 600
            }}
            onClick={() => fetchCalendarDuty(selectedTraining)}
          >
            View Duty
          </Button>

        </Grid>

        {selectedTraining && (()=>{
          const item=trainingList.find((entry)=>entry.trainingName===selectedTraining)
          return item ? <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{p:1.5,border:"1px solid #A7F3D0",background:"#ECFDF5",borderRadius:2,display:"flex",gap:3,flexWrap:"wrap"}}>
              <Box><Typography variant="caption" color="text.secondary">Training dates</Typography><Typography sx={{fontWeight:900}}>{item.startDate} to {item.endDate}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Location</Typography><Typography sx={{fontWeight:900}}>{item.location || "Not specified"}</Typography></Box>
            </Paper>
          </Grid> : null
        })()}

      </Grid>

    </Paper>

  </AccordionDetails>

</Accordion>
)}
</Box>
</Collapse>


{/* ############### Duty Matrix Popup (Full Section) */}


<Dialog open={calendarOpen} maxWidth="xl" fullWidth>

<DialogTitle sx={{pb:1}}>
<Typography sx={{fontSize:20,fontWeight:900}}>Select shift or non-shift employees</Typography>
{(()=>{const item=trainingList.find((entry)=>entry.trainingName===selectedTraining); return item ? <Typography variant="body2" color="text.secondary">{item.trainingName} · {item.startDate} to {item.endDate} · {item.location || "Location not specified"}</Typography> : null})()}
</DialogTitle>

<DialogContent>

<Box sx={{display:"flex",gap:1,mb:2,position:"sticky",top:0,zIndex:5,py:1,background:"#FFFFFF"}}>
{["All","Shift","Non-shift"].map((value)=><Button key={value} size="small" variant={employeeTypeFilter===value ? "contained" : "outlined"} onClick={()=>setEmployeeTypeFilter(value)}>{value} employees</Button>)}
<Chip sx={{ml:"auto"}} color="primary" label={`${selectedEmployees.length} selected`} />
</Box>

{Object.keys(calendarData).filter((group)=>calendarData[group].some((emp)=>employeeTypeFilter==="All" || emp.employeeType===employeeTypeFilter)).map(group => (

<Box key={group} sx={{mb:4}}>

<Typography variant="h6" sx={{display:"flex",alignItems:"center",gap:1}}>
{group}
<Chip size="small" label={`${calendarData[group].length} employees`} />
</Typography>

<Table size="small">

<TableHead>
<TableRow>
<TableCell>Name / designation</TableCell>

{calendarDates.map(date => {
const item=trainingList.find((entry)=>entry.trainingName===selectedTraining)
const highlighted=Boolean(item && date>=item.startDate && date<=item.endDate)
return <TableCell key={date} align="center" sx={{background:highlighted ? "#D1FAE5" : undefined,color:highlighted ? "#065F46" : undefined,fontWeight:highlighted ? 900 : 600}}>
{date}
</TableCell>
})}

<TableCell>Select</TableCell>
</TableRow>
</TableHead>

<TableBody>

{calendarData[group].filter((emp)=>employeeTypeFilter==="All" || emp.employeeType===employeeTypeFilter).map(emp => (

<TableRow key={emp.employeeId} hover>

<TableCell>
<Typography sx={{fontWeight:800}}>{emp.name || emp.employeeId}</Typography>
<Typography variant="caption" color="text.secondary">
{emp.designation || "Designation not set"} · {emp.employeeId}
</Typography>
{(()=>{const days=Number(emp.financialYearTrainingDays || 0); return <Chip size="small" sx={{mt:.7,fontWeight:900,background:days < 5 ? "#FFEDD5" : "#FEF9C3",color:days < 5 ? "#C2410C" : "#854D0E"}} label={`${days} / 7 training days this FY`} />})()}
</TableCell>

{calendarDates.map(date => {

const duty = emp.duties?.[date]
const shift = duty?.shift || "-"
const trainingObj=trainingList.find((entry)=>entry.trainingName===selectedTraining)
const isTrainingDate=Boolean(trainingObj && date>=trainingObj.startDate && date<=trainingObj.endDate)
const hasLeave=Boolean(duty?.leaveStatus && !["Rejected","Cancelled","Withdrawn"].includes(duty.leaveStatus))

return(

<TableCell
key={date}
align="center"
sx={{
backgroundColor:
hasLeave ? "#FFF1F2" :
shift==="Morning" ? "#E3F2FD" :
shift==="Evening" ? "#FFF3E0" :
shift==="Night" ? "#E8F5E9" :
shift==="OFF" ? "#FFEBEE" :
"#fff",
borderTop:isTrainingDate ? "3px solid #0F766E" : undefined,
minWidth:118
}}
>

<Typography sx={{fontWeight:shift==="Training" ? 900 : 500}}>
{shift}
</Typography>
{isTrainingDate && <Typography variant="caption" sx={{display:"block",color:"#047857",fontWeight:900}}>Training date</Typography>}
{hasLeave && <Typography variant="caption" sx={{display:"block",color:"#DC2626",fontWeight:900}}>Leave: {duty.leaveType || duty.leaveStatus}</Typography>}
{duty?.trainingName && (
<Typography variant="caption" sx={{display:"block",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#6A1B9A"}}>
{duty.trainingName}
</Typography>
)}

</TableCell>

)

})}

<TableCell>

<Checkbox
checked={selectedEmployees.includes(emp.employeeId)}
onChange={(e)=>{

if(e.target.checked){

setSelectedEmployees([
...selectedEmployees,
emp.employeeId
])

}else{

setSelectedEmployees(
selectedEmployees.filter(
id => id !== emp.employeeId
)
)

}

}}
/>

</TableCell>

</TableRow>

))}

</TableBody>

</Table>

</Box>

))}

</DialogContent>

<DialogActions>

<Button onClick={()=>setCalendarOpen(false)}>
Cancel
</Button>

<Button
variant="contained"
onClick={nominateTraining}
disabled={!canManageTraining || selectedEmployees.length===0}
>
Nominate Selected
</Button>

</DialogActions>

</Dialog>

{/* ########## Approved employee training / adjacent OFF */}

<Collapse in={activeSection==="mytraining"} timeout={420} unmountOnExit>
<Box id="training-workspace-mytraining" sx={{scrollMarginTop:110}}>
<Accordion defaultExpanded sx={{borderRadius:3,boxShadow:"0 4px 20px rgba(0,0,0,0.08)",overflow:"hidden",mt:4}}>
<AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{background:"linear-gradient(90deg,#047857,#10B981)",color:"white",px:3}}>
<Typography variant="h6" fontWeight={700}>My Approved Training</Typography>
</AccordionSummary>
<AccordionDetails sx={{background:"#F0FDF4",p:3}}>
<Alert severity="info" sx={{mb:2}}>The day before and/or after can be requested only after training approval. The request follows your reporting hierarchy separately.</Alert>
<Table size="small" sx={{background:"#FFFFFF",borderRadius:2,overflow:"hidden"}}>
<TableHead><TableRow sx={{background:"#DCFCE7"}}>
<TableCell sx={{fontWeight:800}}>Training</TableCell><TableCell sx={{fontWeight:800}}>Period / location</TableCell><TableCell sx={{fontWeight:800}}>Adjacent OFF approval</TableCell><TableCell sx={{fontWeight:800}}>Action</TableCell>
</TableRow></TableHead>
<TableBody>
{myApprovedTraining.length===0 ? <TableRow><TableCell colSpan={4} align="center">No approved training is available.</TableCell></TableRow> : myApprovedTraining.map((row)=>{
const request=row.adjacentOffRequest
const choice=myOffChoices[row.id] || {before:false,after:false}
return <TableRow key={row.id} hover>
<TableCell><Typography sx={{fontWeight:900}}>{row.trainingName}</Typography></TableCell>
<TableCell><Typography sx={{fontWeight:700}}>{row.startDate} to {row.endDate}</Typography><Typography variant="caption" color="text.secondary">{row.trainingLocation || "Location not specified"}</Typography></TableCell>
<TableCell>{request ? <Box><Chip size="small" color={request.status==="Approved" ? "success" : request.status==="Rejected" ? "error" : "warning"} label={request.status}/><Typography variant="caption" sx={{display:"block",mt:.5,fontWeight:800}}>OFF: {[request.adjacentOff?.before&&"before",request.adjacentOff?.after&&"after"].filter(Boolean).join(" & ")}</Typography></Box> : <Typography color="text.secondary">Not requested</Typography>}</TableCell>
<TableCell sx={{minWidth:260}}>{(!request || request.status==="Rejected") && <Box sx={{display:"flex",alignItems:"center",gap:1,flexWrap:"wrap"}}>
<Button size="small" variant={choice.before ? "contained" : "outlined"} onClick={()=>setMyOffChoices((current)=>({...current,[row.id]:{before:!choice.before,after:choice.after}}))}>Day before</Button>
<Button size="small" variant={choice.after ? "contained" : "outlined"} onClick={()=>setMyOffChoices((current)=>({...current,[row.id]:{before:choice.before,after:!choice.after}}))}>Day after</Button>
<Button size="small" color="success" variant="contained" disabled={!choice.before&&!choice.after} onClick={()=>requestAdjacentOff(row)}>Submit</Button>
</Box>}</TableCell>
</TableRow>
})}
</TableBody>
</Table>
</AccordionDetails>
</Accordion>
</Box>
</Collapse>


{/* ########## Pending Approval Section */}

<Collapse in={activeSection==="pending"} timeout={420} unmountOnExit>
<Box id="training-workspace-pending" sx={{scrollMarginTop:110}}>
<Accordion
  defaultExpanded
  sx={{
    borderRadius: 3,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    overflow: "hidden",
    mt: 4
  }}
>

<AccordionSummary
  expandIcon={<ExpandMoreIcon />}
  sx={{
    background: "linear-gradient(90deg,#f59e0b,#fbbf24)",
    color: "white",
    px: 3
  }}
>

<Typography variant="h6" fontWeight={600}>
Nominated Employees (Pending)
</Typography>

</AccordionSummary>

<AccordionDetails sx={{background:"#fffaf0"}}>

<Paper elevation={0} sx={{p:3,borderRadius:2}}>

<Table size="small">

<TableHead>

<TableRow sx={{background:"#fff3cd"}}>

<TableCell></TableCell>
<TableCell sx={{fontWeight:600}}>Training</TableCell>
<TableCell sx={{fontWeight:600}}>Period</TableCell>
<TableCell sx={{fontWeight:600}}>Employee</TableCell>
<TableCell sx={{fontWeight:600}}>Training days</TableCell>
<TableCell sx={{fontWeight:600}}>Status</TableCell>
<TableCell sx={{fontWeight:600}}>Approval route</TableCell>
<TableCell sx={{fontWeight:600,minWidth:300}}>Replacement / Acting SIC</TableCell>
<TableCell sx={{fontWeight:600}}>Duty</TableCell>

</TableRow>

</TableHead>

<TableBody>

{pendingList.length===0 ?

<TableRow>
<TableCell colSpan={9} align="center">
No pending nominations
</TableCell>
</TableRow>

:

pendingList.map(row => (

<TableRow
key={row.id}
hover
sx={{
"&:nth-of-type(odd)":{background:"#fffbf2"}
}}
>

<TableCell>

<Checkbox
checked={selectedRows.includes(row.id)}
disabled={!row.canApprove}
onChange={(e)=>{

if(e.target.checked){

setSelectedRows([...selectedRows,row.id])

}else{

setSelectedRows(
selectedRows.filter(id=>id!==row.id)
)

}

}}
/>

</TableCell>

<TableCell>
<Typography sx={{fontWeight:800}}>{row.trainingName}</Typography>
<Typography variant="caption" color="text.secondary">{row.trainingLocation || "Location not specified"}</Typography>
{row.workflowKind==="Adjacent OFF" && <Chip size="small" color="success" variant="outlined" sx={{display:"flex",width:"fit-content",mt:.5,fontWeight:900}} label="Adjacent OFF request" />}
{(row.adjacentOff?.before || row.adjacentOff?.after) && <Typography variant="caption" sx={{display:"block",color:"#047857",fontWeight:800}}>OFF: {[row.adjacentOff?.before&&"before",row.adjacentOff?.after&&"after"].filter(Boolean).join(" & ")}</Typography>}
</TableCell>

<TableCell>{row.startDate}{row.endDate && row.endDate!==row.startDate ? ` to ${row.endDate}` : ""}</TableCell>

<TableCell>
<Typography sx={{fontWeight:800}}>{row.employeeName || row.employeeId}</Typography>
<Typography variant="caption" color="text.secondary">{row.employeeDesignation || row.employeeId}</Typography>
</TableCell>

<TableCell>
<Button size="small" variant="text" sx={{px:0,fontWeight:900}} onClick={()=>setExpandedApprovalId(expandedApprovalId===row.id?"":row.id)}>{row.financialYearTrainingDays || 0} / 7 days</Button>
</TableCell>

<TableCell>{row.status}</TableCell>

<TableCell>
<Typography sx={{fontSize:12,fontWeight:800}}>
{row.currentApproverName ? `Awaiting ${row.currentApproverName}` : "Hierarchy completed"}
</Typography>
<Typography variant="caption" color="text.secondary">
{row.currentApproverLevel || "Final approval"} · {row.approvalProgress}
</Typography>
</TableCell>

<TableCell sx={{verticalAlign:"top",minWidth:300}}>
{row.workflowKind==="Adjacent OFF" ? (
<Alert severity="info" sx={{py:0}}>No replacement or Acting SIC change is required for this OFF approval.</Alert>
) : row.isShiftEmployee ? (
<Box sx={{display:"grid",gap:1}}>
<Typography variant="caption" sx={{fontWeight:800,color:"#03624C"}}>
{row.groupName || "Shift group"}{row.isGroupSIC ? " · SIC going to training" : ""}
</Typography>
<Box sx={{display:"flex",alignItems:"center",gap:.5}}>
<Checkbox
size="small"
checked={Boolean(replacementChoices[row.id]?.replacementRequired)}
onChange={(e)=>{
updateReplacementChoice(row,"replacementRequired",e.target.checked)
if(e.target.checked) loadReplacementCandidates(row)
}}
/>
<Typography sx={{fontSize:12,fontWeight:800}}>Replacement duty required</Typography>
</Box>
{replacementChoices[row.id]?.replacementRequired && (
<TextField
select
size="small"
fullWidth
label="Replacement employee"
value={replacementChoices[row.id]?.replacementEmployeeId || ""}
onChange={(e)=>updateReplacementChoice(row,"replacementEmployeeId",e.target.value)}
SelectProps={{onOpen:()=>loadReplacementCandidates(row)}}
>
{candidateLoading[row.id] && <MenuItem disabled><CircularProgress size={15} sx={{mr:1}}/>Loading employees…</MenuItem>}
{row.replacementEmployee?.employeeId && !(replacementCandidates[row.id] || []).some((item)=>item.employeeId===row.replacementEmployee.employeeId) && (
<MenuItem value={row.replacementEmployee.employeeId}>{row.replacementEmployee.name} ({row.replacementEmployee.employeeId})</MenuItem>
)}
{(replacementCandidates[row.id] || []).map((candidate)=>(
<MenuItem key={candidate.employeeId} value={candidate.employeeId} sx={{display:"block",whiteSpace:"normal"}}>
<Typography sx={{fontSize:12,fontWeight:800}}>{candidate.name} ({candidate.employeeId})</Typography>
<Typography variant="caption" color={candidate.hasConflict ? "error" : "text.secondary"}>
{candidate.source}{candidate.groupName ? ` · ${candidate.groupName}` : ""} · {candidate.dutySummary}
{candidate.hasConflict ? " · Leave/training conflict" : ""}
</Typography>
</MenuItem>
))}
</TextField>
)}
{row.isGroupSIC && (
<>
<Box sx={{display:"flex",alignItems:"center",gap:.5}}>
<Checkbox
size="small"
checked={Boolean(replacementChoices[row.id]?.actingSICEmployeeId)}
onChange={(e)=>{
updateReplacementChoice(row,"assignActingSIC",e.target.checked)
if(!e.target.checked) updateReplacementChoice(row,"actingSICEmployeeId","")
else loadReplacementCandidates(row)
}}
/>
<Typography sx={{fontSize:12,fontWeight:800}}>Assign Acting SIC</Typography>
</Box>
{replacementChoices[row.id]?.assignActingSIC && (
<TextField
select
size="small"
fullWidth
label="Acting SIC employee"
value={replacementChoices[row.id]?.actingSICEmployeeId || ""}
onChange={(e)=>updateReplacementChoice(row,"actingSICEmployeeId",e.target.value)}
SelectProps={{onOpen:()=>loadReplacementCandidates(row)}}
>
<MenuItem value=""><em>Select Acting SIC</em></MenuItem>
{row.actingSICEmployee?.employeeId && !(replacementCandidates[row.id] || []).some((item)=>item.employeeId===row.actingSICEmployee.employeeId) && (
<MenuItem value={row.actingSICEmployee.employeeId}>{row.actingSICEmployee.name} ({row.actingSICEmployee.employeeId})</MenuItem>
)}
{(replacementCandidates[row.id] || []).map((candidate)=>(
<MenuItem key={candidate.employeeId} value={candidate.employeeId} sx={{display:"block",whiteSpace:"normal"}}>
<Typography sx={{fontSize:12,fontWeight:800}}>{candidate.name} ({candidate.employeeId})</Typography>
<Typography variant="caption" color={candidate.hasConflict ? "error" : "text.secondary"}>
{candidate.source}{candidate.groupName ? ` · ${candidate.groupName}` : ""} · {candidate.dutySummary}
</Typography>
</MenuItem>
))}
</TextField>
)}
</>
)}
</Box>
) : <Typography variant="caption" color="text.secondary">Non-shift employee</Typography>}
</TableCell>

<TableCell>

<Button
variant="outlined"
size="small"
sx={{borderRadius:2}}
onClick={()=>fetchCalendarDuty(row.trainingName,row.startDate,row.endDate)}
>
View Duty
</Button>

</TableCell>

</TableRow>

))

}

</TableBody>

</Table>

<Dialog open={Boolean(selectedApprovalDetail)} onClose={()=>setExpandedApprovalId("")} maxWidth="md" fullWidth>
<DialogTitle sx={{fontWeight:900,color:"#4C1D95"}}>Training details & approval hierarchy</DialogTitle>
<DialogContent dividers>
{selectedApprovalDetail && <Box sx={{display:"grid",gap:1.25}}>
<Typography sx={{fontWeight:900}}>{selectedApprovalDetail.employeeName || selectedApprovalDetail.employeeId} · {selectedApprovalDetail.financialYearTrainingDays || 0} / 7 training days</Typography>
<Typography variant="caption" color="text.secondary">{selectedApprovalDetail.financialYear || "Current financial year"}</Typography>
<Box sx={{display:"grid",gap:.55}}>
<Typography sx={{fontSize:12,fontWeight:900}}>Approved training details</Typography>
<Stack direction="row" spacing={.6} useFlexGap flexWrap="wrap">
{(selectedApprovalDetail.financialYearTrainingHistory || []).map((item,index)=><Chip key={`${item.trainingName}-${index}`} size="small" label={`${item.trainingName} · ${item.startDate}${item.endDate && item.endDate!==item.startDate ? ` to ${item.endDate}` : ""} · ${item.days} day(s)`} sx={{background:"#F3E8FF",color:"#6B21A8",fontWeight:800}} />)}
{!(selectedApprovalDetail.financialYearTrainingHistory || []).length && <Typography variant="caption" color="text.secondary">No approved training in this financial year.</Typography>}
</Stack>
</Box>
<Box sx={{display:"grid",gap:.55}}>
<Typography sx={{fontSize:12,fontWeight:900}}>Approval hierarchy</Typography>
<Stack direction="row" spacing={.6} useFlexGap flexWrap="wrap" alignItems="center">
{(selectedApprovalDetail.approvalChain || []).map((step,index)=><React.Fragment key={`${step.employeeId}-${index}`}><Chip size="small" label={`${step.level || "Approver"}: ${step.name || step.employeeId}`} sx={{background:step.status==="Approved" ? "#DCFCE7" : "#FFEDD5",color:step.status==="Approved" ? "#166534" : "#C2410C",border:`1px solid ${step.status==="Approved" ? "#86EFAC" : "#FDBA74"}`,fontWeight:850}} />{index<(selectedApprovalDetail.approvalChain || []).length-1 && <Typography sx={{fontWeight:900,color:"#94A3B8"}}>→</Typography>}</React.Fragment>)}
</Stack>
</Box>
</Box>}
</DialogContent>
<DialogActions><Button onClick={()=>setExpandedApprovalId("")}>Close</Button></DialogActions>
</Dialog>

<Box sx={{mt:3,display:"flex",gap:2}}>

<Button
variant="contained"
color="success"
sx={{borderRadius:2,fontWeight:600}}
onClick={approveTraining}
disabled={
!selectedRows.length ||
selectedRows.some((id)=>{
const choice=replacementChoices[id] || {}
return (choice.replacementRequired && !choice.replacementEmployeeId) ||
(choice.assignActingSIC && !choice.actingSICEmployeeId)
})
}
>
Approve & Forward
</Button>

</Box>

</Paper>

</AccordionDetails>

</Accordion>
</Box>
</Collapse>

{/* ############### History Section */}

<Collapse in={activeSection==="history"} timeout={420} unmountOnExit>
<Box id="training-workspace-history" sx={{scrollMarginTop:110}}>
{canViewTrainingPage && (
<Accordion
  defaultExpanded
  sx={{
    borderRadius: 3,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    overflow: "hidden",
    mt: 4
  }}
>

<AccordionSummary
  expandIcon={<ExpandMoreIcon />}
  sx={{
    background: "linear-gradient(90deg,#6366f1,#818cf8)",
    color: "white",
    px:3
  }}
>

<Typography variant="h6" fontWeight={600}>
Nomination History & Reports
</Typography>

</AccordionSummary>

<AccordionDetails sx={{background:"#f8f9ff"}}>

<Paper elevation={0} sx={{p:3,borderRadius:2}}>

<Box sx={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:2,flexWrap:"wrap",mb:2.5}}>
<Box sx={{display:"flex",gap:1,p:.6,borderRadius:2,background:"#EEF2FF"}}>
<Button size="small" variant={historyView==="history" ? "contained" : "text"} onClick={()=>setHistoryView("history")} sx={{fontWeight:850,textTransform:"none"}}>Nomination History</Button>
<Button size="small" variant={historyView==="matrix" ? "contained" : "text"} onClick={()=>setHistoryView("matrix")} sx={{fontWeight:850,textTransform:"none"}}>Training Nomination Matrix</Button>
</Box>
{historyView==="matrix" && <Button variant="outlined" onClick={exportNominationMatrix} disabled={!nominationMatrix.employees.length} sx={{fontWeight:850,textTransform:"none"}}>Export Excel-compatible CSV</Button>}
</Box>

<Box sx={{display:"flex",gap:2,flexWrap:"wrap",mb:3}}>

<TextField
select
label="Financial Year"
value={historyFY}
onChange={(e)=>setHistoryFY(e.target.value)}
sx={{minWidth:200}}
>

<MenuItem value="">All</MenuItem>

{financialYears.map(fy=>(
<MenuItem key={fy} value={fy}>
{fy}
</MenuItem>
))}

</TextField>

<TextField
label="Employee ID"
value={historyEmployee}
onChange={(e)=>setHistoryEmployee(e.target.value)}
sx={{minWidth:200}}
/>

{historyView==="matrix" && <TextField select label="Nomination Status" value={matrixStatus} onChange={(e)=>setMatrixStatus(e.target.value)} sx={{minWidth:210}}>
<MenuItem value="All">All statuses</MenuItem>
{matrixStatuses.map((status)=><MenuItem key={status} value={status}>{status}</MenuItem>)}
</TextField>}

</Box>

{historyView==="history" ? <>
<Table size="small">

<TableHead>

<TableRow sx={{background:"#eef2ff"}}>

<TableCell sx={{fontWeight:600}}>Training</TableCell>
<TableCell sx={{fontWeight:600}}>Date</TableCell>
<TableCell sx={{fontWeight:600}}>Employee</TableCell>
<TableCell sx={{fontWeight:600}}>Status</TableCell>
<TableCell sx={{fontWeight:600}}>Approval progress</TableCell>

</TableRow>

</TableHead>

<TableBody>

{history.length===0 ?

<TableRow>
<TableCell colSpan={5} align="center">
No history found
</TableCell>
</TableRow>

:

history.map(row => (

<TableRow
key={row.id}
hover
sx={{
"&:nth-of-type(odd)":{background:"#fafbff"}
}}
>

<TableCell>{row.trainingName}</TableCell>

<TableCell>{row.trainingDate}</TableCell>

<TableCell>{row.employeeName || row.employeeId}<br/><Typography variant="caption">{row.employeeId}</Typography></TableCell>

<TableCell>{row.status}</TableCell>

<TableCell>{row.approvalProgress || "-"}</TableCell>

</TableRow>

))

}

</TableBody>

</Table>
</> : <>
<Grid container spacing={1.5} sx={{mb:2.5}}>
{[
{label:"Employees",value:nominationMatrix.employees.length,color:"#4338CA",background:"#EEF2FF"},
{label:"Training programmes",value:nominationMatrix.programmes.length,color:"#0369A1",background:"#E0F2FE"},
{label:"Nominations",value:nominationMatrix.nominationCount,color:"#9A3412",background:"#FFF7ED"},
{label:"Approved",value:nominationMatrix.approvedCount,color:"#166534",background:"#DCFCE7"},
].map((item)=><Grid item xs={6} md={3} key={item.label}><Box sx={{p:1.6,borderRadius:2,background:item.background,border:`1px solid ${item.color}22`}}><Typography sx={{fontSize:11.5,fontWeight:800,color:"#64748B"}}>{item.label}</Typography><Typography sx={{fontSize:24,fontWeight:950,color:item.color}}>{item.value}</Typography></Box></Grid>)}
</Grid>

<Box sx={{overflowX:"auto",border:"1px solid #DDE5F3",borderRadius:2}}>
<Table size="small" sx={{minWidth:Math.max(1050,620+(nominationMatrix.programmes.length*230))}}>
<TableHead>
<TableRow sx={{background:"#E0E7FF"}}>
<TableCell sx={{fontWeight:900,minWidth:220,position:"sticky",left:0,zIndex:3,background:"#E0E7FF"}}>Employee</TableCell>
<TableCell sx={{fontWeight:900,minWidth:140}}>Designation / Group</TableCell>
{nominationMatrix.programmes.map((programme)=><TableCell key={programme} align="center" sx={{fontWeight:900,minWidth:230,borderLeft:"1px solid #C7D2FE"}}>{programme}</TableCell>)}
<TableCell align="center" sx={{fontWeight:900,minWidth:90}}>Total</TableCell>
<TableCell align="center" sx={{fontWeight:900,minWidth:90}}>Approved</TableCell>
<TableCell align="center" sx={{fontWeight:900,minWidth:90}}>Pending</TableCell>
<TableCell align="center" sx={{fontWeight:900,minWidth:110}}>Rejected / Cancelled</TableCell>
<TableCell align="center" sx={{fontWeight:900,minWidth:120}}>Approved Days</TableCell>
</TableRow>
</TableHead>
<TableBody>
{!nominationMatrix.employees.length ? <TableRow><TableCell colSpan={nominationMatrix.programmes.length+7} align="center" sx={{py:5,color:"#64748B"}}>No nomination data found for the selected filters.</TableCell></TableRow> : nominationMatrix.employees.map((employee)=><TableRow key={employee.employeeId} hover>
<TableCell sx={{position:"sticky",left:0,zIndex:2,background:"#FFFFFF"}}><Typography sx={{fontWeight:900,fontSize:13}}>{employee.employeeName}</Typography><Typography variant="caption" color="text.secondary">{employee.employeeId} · {employee.employeeType}</Typography></TableCell>
<TableCell><Typography sx={{fontSize:12,fontWeight:750}}>{employee.designation}</Typography><Typography variant="caption" color="text.secondary">{employee.groupName}</Typography></TableCell>
{nominationMatrix.programmes.map((programme)=><TableCell key={programme} sx={{borderLeft:"1px solid #EEF2FF",verticalAlign:"top"}}>
<Stack spacing={.7}>{(employee.cells[programme] || []).map((item)=><Box key={item.id} sx={{p:.8,borderRadius:1.5,background:"#F8FAFC"}}><Chip size="small" label={item.status || "Unknown"} sx={{height:21,fontSize:10,fontWeight:850,...statusChipSx(item.status)}}/><Typography sx={{mt:.45,fontSize:10.5,color:"#475569"}}>{item.startDate || item.trainingDate}{item.endDate && item.endDate!==item.startDate ? ` to ${item.endDate}` : ""}</Typography></Box>)}</Stack>
</TableCell>)}
<TableCell align="center" sx={{fontWeight:900}}>{employee.total}</TableCell>
<TableCell align="center" sx={{fontWeight:900,color:"#166534"}}>{employee.approved}</TableCell>
<TableCell align="center" sx={{fontWeight:900,color:"#9A3412"}}>{employee.pending}</TableCell>
<TableCell align="center" sx={{fontWeight:900,color:"#991B1B"}}>{employee.rejected}</TableCell>
<TableCell align="center" sx={{fontWeight:900,color:"#4338CA"}}>{employee.approvedDays}</TableCell>
</TableRow>)}
</TableBody>
</Table>
</Box>
<Typography sx={{mt:1.2,fontSize:11,color:"#64748B"}}>Each cell shows every nomination for that employee and training programme. Approved Days counts inclusive calendar days for approved nominations only.</Typography>
</>}

</Paper>

</AccordionDetails>

</Accordion>
)}
</Box>
</Collapse>

</Box>

)

}
