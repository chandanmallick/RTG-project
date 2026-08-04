import React, { useState, useEffect } from "react"
import api from "./api"

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

const [holiday,setHoliday]=useState({
date:"",
holidayName:"",
holidayNameHindi:""
})

const [training,setTraining]=useState({
trainingName:"",
trainingNameHindi:"",
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

/* ================= APPROVAL ================= */

const [pendingList,setPendingList]=useState([])
const [selectedRows,setSelectedRows]=useState([])
const [replacementChoices,setReplacementChoices]=useState({})
const [replacementCandidates,setReplacementCandidates]=useState({})
const [candidateLoading,setCandidateLoading]=useState({})

/* ================= HISTORY ================= */

const [history,setHistory]=useState([])
const [historyFY,setHistoryFY]=useState("")
const [historyEmployee,setHistoryEmployee]=useState("")
const [notice,setNotice]=useState(null)
const [activeSection,setActiveSection]=useState(null)

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

await api.post(`/Training_holiday/training`,{
...training,
financialYear:selectedFY
})

setTraining({
trainingName:"",
trainingNameHindi:"",
startDate:"",
endDate:""
})

fetchTraining()

}catch(err){
console.error(err)
}

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
{key:"pending",title:"Pending Approvals",subtitle:"Review and forward nominations",count:pendingList.length,color:"#D97706",tint:"#FFF7E8"},
...(canViewTrainingPage ? [{key:"history",title:"Nomination History",subtitle:"View completed workflow records",count:history.length,color:"#4338CA",tint:"#EEF2FF"}] : []),
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

        <Grid item xs={3}>
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

        <Grid item xs={2}>
          <TextField
            type="date"
            disabled={!canManageTraining}
            fullWidth
            value={training.startDate}
            onChange={(e) =>
              setTraining({ ...training, startDate: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={2}>
          <TextField
            type="date"
            disabled={!canManageTraining}
            fullWidth
            value={training.endDate}
            onChange={(e) =>
              setTraining({ ...training, endDate: e.target.value })
            }
          />
        </Grid>

        <Grid item xs={2}>
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
            ADD
          </Button>
        </Grid>

      </Grid>

      <Table sx={{ mt: 4 }}>

        <TableHead>
          <TableRow sx={{ backgroundColor: "#e0f2fe" }}>
            <TableCell sx={{ fontWeight: 600 }}>Training</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Start</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>End</TableCell>
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
              <TableCell>{t.startDate}</TableCell>
              <TableCell>{t.endDate}</TableCell>

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

      </Grid>

    </Paper>

  </AccordionDetails>

</Accordion>
)}
</Box>
</Collapse>


{/* ############### Duty Matrix Popup (Full Section) */}


<Dialog open={calendarOpen} maxWidth="lg" fullWidth>

<DialogTitle>Select shift or non-shift employees</DialogTitle>

<DialogContent>

{Object.keys(calendarData).map(group => (

<Box key={group} sx={{mb:4}}>

<Typography variant="h6" sx={{display:"flex",alignItems:"center",gap:1}}>
{group}
<Chip size="small" label={`${calendarData[group].length} employees`} />
</Typography>

<Table size="small">

<TableHead>
<TableRow>
<TableCell>Name / designation</TableCell>

{calendarDates.map(date => (
<TableCell key={date} align="center">
{date}
</TableCell>
))}

<TableCell>Select</TableCell>
</TableRow>
</TableHead>

<TableBody>

{calendarData[group].map(emp => (

<TableRow key={emp.employeeId} hover>

<TableCell>
<Typography sx={{fontWeight:800}}>{emp.name || emp.employeeId}</Typography>
<Typography variant="caption" color="text.secondary">
{emp.designation || "Designation not set"} · {emp.employeeId}
</Typography>
</TableCell>

{calendarDates.map(date => {

const duty = emp.duties?.[date]
const shift = duty?.shift || "-"

return(

<TableCell
key={date}
align="center"
sx={{
backgroundColor:
shift==="Morning" ? "#E3F2FD" :
shift==="Evening" ? "#FFF3E0" :
shift==="Night" ? "#E8F5E9" :
shift==="OFF" ? "#FFEBEE" :
"#fff"
}}
>

<Typography sx={{fontWeight:shift==="Training" ? 900 : 500}}>
{shift}
</Typography>
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
disabled={!canManageTraining}
>
Nominate Selected
</Button>

</DialogActions>

</Dialog>


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
<TableCell sx={{fontWeight:600}}>Status</TableCell>
<TableCell sx={{fontWeight:600}}>Approval route</TableCell>
<TableCell sx={{fontWeight:600,minWidth:300}}>Replacement / Acting SIC</TableCell>
<TableCell sx={{fontWeight:600}}>Duty</TableCell>

</TableRow>

</TableHead>

<TableBody>

{pendingList.length===0 ?

<TableRow>
<TableCell colSpan={8} align="center">
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

<TableCell>{row.trainingName}</TableCell>

<TableCell>{row.startDate}{row.endDate && row.endDate!==row.startDate ? ` to ${row.endDate}` : ""}</TableCell>

<TableCell>
<Typography sx={{fontWeight:800}}>{row.employeeName || row.employeeId}</Typography>
<Typography variant="caption" color="text.secondary">{row.employeeDesignation || row.employeeId}</Typography>
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
{row.isShiftEmployee ? (
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
Training Nomination History
</Typography>

</AccordionSummary>

<AccordionDetails sx={{background:"#f8f9ff"}}>

<Paper elevation={0} sx={{p:3,borderRadius:2}}>

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

</Box>

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

</Paper>

</AccordionDetails>

</Accordion>
)}
</Box>
</Collapse>

</Box>

)

}
