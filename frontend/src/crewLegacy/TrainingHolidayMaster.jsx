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
} from "@mui/material"

import { ExpandLess, ExpandMore  } from "@mui/icons-material"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export default function TrainingHolidayMaster(){

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

/* ================= HISTORY ================= */

const [history,setHistory]=useState([])
const [historyFY,setHistoryFY]=useState("")
const [historyEmployee,setHistoryEmployee]=useState("")

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
fetchHoliday()
},[selectedYear])

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
fetchTraining()
},[selectedFY])

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

const fetchCalendarDuty = async(trainingName)=>{

const trainingObj = trainingList.find(
t=>t.trainingName===trainingName
)

if(!trainingObj) return

const res = await api.get(
`/training-assign/calendar/${trainingObj.startDate}/${trainingObj.endDate}`
)

setCalendarData(res.data)
setCalendarDates(generateDates(trainingObj.startDate,trainingObj.endDate))

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
trainingName:selectedTraining,
employees:selectedEmployees
})

setCalendarOpen(false)

fetchPending()

}catch(err){
console.error(err)
}

}

/* ================= PENDING ================= */

const fetchPending = async()=>{

try{

const res = await api.get("/training-assign/pending")

setPendingList(res.data || [])

}catch(err){
console.error(err)
}

}

useEffect(()=>{
fetchPending()
},[])

/* ================= APPROVE ================= */

const approveTraining = async()=>{

await api.post("/training-assign/approve",{
ids:selectedRows,
user:"DIC"
})

fetchPending()

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
fetchHistory()
},[historyFY,historyEmployee])

/* ================= UI ================= */

return(

<Box sx={{p:4,background:"#f4f6fb",minHeight:"100vh"}}>

{/* HEADER */}

<Typography variant="h4" sx={{mb:4,fontWeight:600}}>
Training & Holiday Management
</Typography>

{/* ================= HOLIDAY ================= */}

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

{/* ================= TRAINING ================= */}

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

{/* ================= ASSIGN ================= */}

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


{/* ############### Duty Matrix Popup (Full Section) */}


<Dialog open={calendarOpen} maxWidth="lg" fullWidth>

<DialogTitle>Duty Calendar</DialogTitle>

<DialogContent>

{Object.keys(calendarData).map(group => (

<Box key={group} sx={{mb:4}}>

<Typography variant="h6">{group}</Typography>

<Table size="small">

<TableHead>
<TableRow>
<TableCell>Name</TableCell>

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

<TableCell>{emp.name}</TableCell>

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

{shift}

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
>
Nominate Selected
</Button>

</DialogActions>

</Dialog>


{/* ########## Pending Approval Section */}

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
<TableCell sx={{fontWeight:600}}>Date</TableCell>
<TableCell sx={{fontWeight:600}}>Employee</TableCell>
<TableCell sx={{fontWeight:600}}>Status</TableCell>
<TableCell sx={{fontWeight:600}}>Duty</TableCell>

</TableRow>

</TableHead>

<TableBody>

{pendingList.length===0 ?

<TableRow>
<TableCell colSpan={6} align="center">
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

<TableCell>{row.trainingDate}</TableCell>

<TableCell>
{row.employeeName || row.employeeId}
</TableCell>

<TableCell>{row.status}</TableCell>

<TableCell>

<Button
variant="outlined"
size="small"
sx={{borderRadius:2}}
onClick={()=>fetchCalendarDuty(row.trainingName)}
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
>
Approve (DIC)
</Button>

<Button
variant="contained"
sx={{borderRadius:2,fontWeight:600}}
onClick={finalizeTraining}
>
Finalize (Admin)
</Button>

</Box>

</Paper>

</AccordionDetails>

</Accordion>

{/* ############### History Section */}

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

</TableRow>

</TableHead>

<TableBody>

{history.length===0 ?

<TableRow>
<TableCell colSpan={4} align="center">
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

<TableCell>{row.employeeId}</TableCell>

<TableCell>{row.status}</TableCell>

</TableRow>

))

}

</TableBody>

</Table>

</Paper>

</AccordionDetails>

</Accordion>

</Box>

)

}
