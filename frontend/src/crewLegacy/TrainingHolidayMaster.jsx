import React, { useState, useEffect, useRef } from "react"
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
Tooltip,
} from "@mui/material"

import { ExpandLess, ExpandMore  } from "@mui/icons-material"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Users, Pencil, Plus, Trash2, Medal } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TrainingCalendarReview from "../components/crew/TrainingCalendarReview";
import NominationMatrix from "../components/crew/NominationMatrix";
import WorkflowHeader from "../components/crew/WorkflowHeader";

export default function TrainingHolidayMaster({embeddedRequest=false,onRequestSubmitted,embeddedApproval=false,initialApprovalId="",onApprovalChanged,initialEmployeeId="",initialEmployeeName=""}={}){
const { user } = useAuth()
const trainingAccess = user?.permissions?.crew_training || {}
const canViewTrainingPage = Boolean(trainingAccess.view)
const canManageTraining = Boolean(trainingAccess.write)
const canManageTrainingPrograms = Boolean(trainingAccess.approve)
const isTrainingHR = Boolean(trainingAccess.approve)
// Sports events share the same backend authority as the sports workflow:
// an HR training approver, a leave approver, or an administrator.
const canManageSportsEvents = Boolean(trainingAccess.approve || user?.permissions?.crew_leave?.approve || String(user?.role || "").toLowerCase() === "admin")

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

const [reviewNomination,setReviewNomination]=useState(null)
const draggedNomination=useRef(null)
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

/* ================= PROGRAMME / SPORTS EDITOR ================= */

const emptyProgrammeForm={trainingName:"",trainingNameHindi:"",location:"",startDate:"",endDate:""}
const [programmeEditor,setProgrammeEditor]=useState(null)
const [programmeForm,setProgrammeForm]=useState(emptyProgrammeForm)
const [programmeBusy,setProgrammeBusy]=useState(false)
const [programmeError,setProgrammeError]=useState("")
const emptySportsForm={name:"",venue:"",startDate:"",endDate:"",description:""}
const [sportsEditor,setSportsEditor]=useState(null)
const [sportsForm,setSportsForm]=useState(emptySportsForm)
const [sportsBusy,setSportsBusy]=useState(false)
const [sportsError,setSportsError]=useState("")

/* ================= ASSIGN ================= */

const [selectedTraining,setSelectedTraining]=useState("")
const [assignCalendarMonth,setAssignCalendarMonth]=useState(()=>new Date().toISOString().slice(0,7))
const [requestedTraining,setRequestedTraining]=useState("")
const [requestSaving,setRequestSaving]=useState(false)
const [calendarOpen,setCalendarOpen]=useState(false)
const [calendarData,setCalendarData]=useState({})
const [calendarDates,setCalendarDates]=useState([])

const [selectedEmployees,setSelectedEmployees]=useState([])
const [employeeTypeFilter,setEmployeeTypeFilter]=useState("All")
const [departmentFilter,setDepartmentFilter]=useState("All")
const [delegationOpen,setDelegationOpen]=useState(false)
const [delegationRows,setDelegationRows]=useState([])
const [delegationLoading,setDelegationLoading]=useState(false)
const [canAssignTraining,setCanAssignTraining]=useState(Boolean(trainingAccess.write || trainingAccess.approve))
const [canDelegateTraining,setCanDelegateTraining]=useState(false)

/* ================= APPROVAL ================= */

const [pendingList,setPendingList]=useState([])
const [selectedRows,setSelectedRows]=useState([])
const [replacementChoices,setReplacementChoices]=useState({})
const [replacementCandidates,setReplacementCandidates]=useState({})
const [candidateLoading,setCandidateLoading]=useState({})
const [expandedApprovalId,setExpandedApprovalId]=useState(()=>initialApprovalId || new URLSearchParams(window.location.search).get("requestId") || "")

/* ================= HISTORY ================= */

const [history,setHistory]=useState([])
const historyRequest=useRef(0)
const [historyBusy,setHistoryBusy]=useState(false)
const [historyError,setHistoryError]=useState("")
const [historyFY,setHistoryFY]=useState("")
const [historyEmployee,setHistoryEmployee]=useState("")
const [historyView,setHistoryView]=useState("matrix")
const [matrixStatus,setMatrixStatus]=useState("All")
const [matrixTrainingList,setMatrixTrainingList]=useState([])
const [myApprovedTraining,setMyApprovedTraining]=useState([])
const [myOffChoices,setMyOffChoices]=useState({})
const [notice,setNotice]=useState(null)
const calendarHolidayMap=useMemo(()=>{
const result={}
Object.values(calendarData).forEach((employees)=>(employees || []).forEach((employee)=>Object.entries(employee.duties || {}).forEach(([date,duty])=>{
if(duty?.isHoliday) result[date]=duty.holidayName || "Holiday"
})))
return result
},[calendarData])
const requestedSection=new URLSearchParams(window.location.search).get("section")
const [activeSection,setActiveSection]=useState(()=>embeddedRequest ? "request" : embeddedApproval ? "pending" : requestedSection || (canAssignTraining ? "assign" : canViewTrainingPage ? "request" : "pending"))
useEffect(()=>{
if(!embeddedRequest && !embeddedApproval && !requestedSection && canAssignTraining) setActiveSection("assign")
},[canAssignTraining,embeddedApproval,embeddedRequest,requestedSection])
const selectedApprovalDetail = pendingList.find((row)=>row.id===expandedApprovalId)

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
window.dispatchEvent(new Event("crew-holidays-changed"))

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
if(canViewTrainingPage || embeddedRequest) fetchTraining()
},[selectedFY,canViewTrainingPage,embeddedRequest])

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

/* ================= PROGRAMME EDITOR (from calendar) ================= */

const openProgrammeEditor=(item, defaultDate="")=>{
setProgrammeError("")
setProgrammeForm(item ? {
trainingName:item.trainingName || "",
trainingNameHindi:item.trainingNameHindi || "",
location:item.location || "",
startDate:item.startDate || defaultDate || "",
endDate:item.endDate || defaultDate || item.startDate || "",
} : {
...emptyProgrammeForm,
startDate:defaultDate,
endDate:defaultDate,
})
setProgrammeEditor(item ? {mode:"edit",id:item.id,title:item.trainingName || "Training programme"} : {mode:"create",id:"",title:"New training programme"})
}

const saveProgramme=async()=>{
if(programmeBusy) return
setProgrammeError("")
if(!programmeForm.trainingName.trim()){
setProgrammeError("Training name is required.")
return
}
if(!programmeForm.startDate || !programmeForm.endDate || programmeForm.endDate<programmeForm.startDate){
setProgrammeError("Provide valid start and end dates (end must not be before start).")
return
}
setProgrammeBusy(true)
try{
const payload={...programmeForm,financialYear:selectedFY}
if(programmeEditor?.mode==="edit"){
await api.put(`/Training_holiday/training/${programmeEditor.id}`,payload)
}else{
await api.post(`/Training_holiday/training`,{...payload,status:"Scheduled"})
}
setNotice({severity:"success",text:programmeEditor?.mode==="edit" ? "Training programme updated." : "Training programme added."})
setProgrammeEditor(null)
setProgrammeForm(emptyProgrammeForm)
await fetchTraining()
}catch(err){
setProgrammeError(err?.response?.data?.detail || err?.message || "The programme could not be saved.")
}finally{
setProgrammeBusy(false)
}
}

const deleteProgramme=async()=>{
if(programmeBusy || programmeEditor?.mode!=="edit") return
if(!window.confirm(`Delete the training programme "${programmeForm.trainingName}"? Existing nominations are not removed automatically.`)) return
setProgrammeBusy(true)
setProgrammeError("")
try{
await api.delete(`/Training_holiday/training/${programmeEditor.id}`)
setNotice({severity:"success",text:"Training programme deleted."})
setProgrammeEditor(null)
setProgrammeForm(emptyProgrammeForm)
if(trainingList.find((entry)=>entry.id===programmeEditor.id)?.trainingName===selectedTraining) setSelectedTraining("")
await fetchTraining()
}catch(err){
setProgrammeError(err?.response?.data?.detail || err?.message || "The programme could not be deleted.")
}finally{
setProgrammeBusy(false)
}
}

const editProgrammeFromCard=(item, event)=>{
event?.stopPropagation?.()
openProgrammeEditor(item)
}

/* ================= SPORTS EVENT (from calendar) ================= */

const openSportsEditor=(defaultDate="")=>{
setSportsError("")
setSportsForm({
name:"",
venue:"",
startDate:defaultDate,
endDate:defaultDate,
description:"",
})
setSportsEditor({defaultDate:defaultDate || ""})
}

const saveSportsEvent=async()=>{
if(sportsBusy) return
setSportsError("")
if(!sportsForm.name.trim()){
setSportsError("Sports event name is required.")
return
}
if(!sportsForm.startDate || !sportsForm.endDate || sportsForm.endDate<sportsForm.startDate){
setSportsError("Provide valid start and end dates (end must not be before start).")
return
}
setSportsBusy(true)
try{
await api.post("/sports/events",sportsForm)
setNotice({severity:"success",text:"Sports event added to the calendar. Employees can now apply against it."})
setSportsEditor(null)
setSportsForm(emptySportsForm)
}catch(err){
setSportsError(err?.response?.data?.detail || err?.message || "The sports event could not be saved.")
}finally{
setSportsBusy(false)
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

const fetchCalendarDuty = async(trainingName, fallbackStartDate = "", fallbackEndDate = "", openDialog = true)=>{

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
setDepartmentFilter("All")

if(openDialog) setCalendarOpen(true)

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
requestType:"Assigned",
employees:selectedEmployees
})

setCalendarOpen(false)
setSelectedEmployees([])
setNotice({severity:"success",text:"Training nomination sent directly to HR for final approval."})

fetchPending()
fetchHistory()

}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || err?.message || "Training nomination could not be saved."})
}
}

const openTrainingDelegation=async()=>{
setDelegationOpen(true)
setDelegationLoading(true)
try{
const res=await api.get("/training-assign/delegation")
setDelegationRows(res.data || [])
}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || "Delegation list could not be loaded."})
}finally{
setDelegationLoading(false)
}
}

useEffect(()=>{
if(!canViewTrainingPage) return
api.get("/training-assign/nomination-access").then((res)=>{
setCanAssignTraining(Boolean(res.data?.canAssign))
setCanDelegateTraining(Boolean(res.data?.canDelegate))
}).catch(()=>{})
},[canViewTrainingPage])

const toggleTrainingDelegation=async(row)=>{
try{
await api.post("/training-assign/delegation",{employeeId:row.employeeId,enabled:!row.delegated})
setDelegationRows((current)=>current.map((item)=>item.employeeId===row.employeeId ? {...item,delegated:!row.delegated,hasNominationWrite:!row.delegated || item.hasNominationWrite} : item))
setNotice({severity:"success",text:!row.delegated ? `Nomination power delegated to ${row.name}.` : `Delegation withdrawn from ${row.name}.`})
}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || "Delegation could not be updated."})
}
}

const requestOwnTraining = async()=>{
const trainingObj=trainingList.find((item)=>item.trainingName===requestedTraining)
const actorId=String(user?.employeeId || user?.userId || "").trim()
const targetId=initialEmployeeId || actorId
if(!trainingObj || !targetId || requestSaving) return
setRequestSaving(true)
try{
await api.post("/training-assign/nominate",{
date:trainingObj.startDate,
startDate:trainingObj.startDate,
endDate:trainingObj.endDate,
trainingName:trainingObj.trainingName,
trainingLocation:trainingObj.location || "",
requestType:targetId===actorId ? "Self Request" : "Assigned",
employees:[targetId]
})
setRequestedTraining("")
setNotice({severity:"success",text:"Training request submitted for approval."})
await Promise.all([fetchPending(),fetchHistory()])
onRequestSubmitted?.()
}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || err?.message || "Training request could not be submitted."})
}finally{
setRequestSaving(false)
}
}

const trainingLineColor=(value)=>{
const palette=["#7C3AED","#DB2777","#0284C7","#EA580C","#0F766E","#4F46E5","#B45309"]
const textValue=String(value || "Training")
const hash=Array.from(textValue).reduce((total,char)=>((total*31)+char.charCodeAt(0))>>>0,0)
return palette[hash%palette.length]
}

const activeTrainingProgrammes=useMemo(()=>(trainingList || [])
.filter((item)=>!["inactive","cancelled","deleted"].includes(String(item.status || "").toLowerCase()))
.filter((item)=>item.startDate && (item.endDate || item.startDate)),[trainingList])

const assignCalendarDays=useMemo(()=>{
const [year,month]=assignCalendarMonth.split("-").map(Number)
if(!year || !month) return []
const firstDay=new Date(year,month-1,1)
const gridStart=new Date(year,month-1,1-firstDay.getDay())
return Array.from({length:42},(_,index)=>{
const date=new Date(gridStart)
date.setDate(gridStart.getDate()+index)
const dateValue=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`
return {
date:dateValue,
day:date.getDate(),
currentMonth:date.getMonth()===month-1,
today:dateValue===new Date().toISOString().slice(0,10),
programmes:activeTrainingProgrammes.filter((item)=>dateValue>=item.startDate && dateValue<=(item.endDate || item.startDate)),
}
})
},[activeTrainingProgrammes,assignCalendarMonth])

const selectedTrainingProgramme=useMemo(()=>(trainingList || []).find((item)=>item.trainingName===selectedTraining) || null,[trainingList,selectedTraining])
useEffect(()=>{
if(selectedTrainingProgramme && canAssignTraining) fetchCalendarDuty(selectedTrainingProgramme.trainingName,selectedTrainingProgramme.startDate,selectedTrainingProgramme.endDate,false)
// Loading the calendar context here makes existing nominees visible before the assignment dialog is opened.
// eslint-disable-next-line react-hooks/exhaustive-deps
},[selectedTrainingProgramme?.trainingName,canAssignTraining])

const nominatedEmployeesByDate=useMemo(()=>{
const result={}
Object.values(calendarData).forEach((employees)=>(employees || []).forEach((employee)=>Object.entries(employee.duties || {}).forEach(([date,duty])=>{
(duty?.trainingLines || []).forEach((line)=>{
if(!selectedTraining || line.trainingName!==selectedTraining) return
result[date] ||= []
if(!result[date].some((item)=>item.employeeId===employee.employeeId)) result[date].push({employeeId:employee.employeeId,name:employee.name})
})
})))
return result
},[calendarData,selectedTraining])
const nominatedEmployeesForSelectedTraining=useMemo(()=>{
const result=[]
Object.values(nominatedEmployeesByDate).flat().forEach((person)=>{
if(!result.some((item)=>item.employeeId===person.employeeId)) result.push(person)
})
return result
},[nominatedEmployeesByDate])
const availableDepartments=useMemo(()=>Array.from(new Set(Object.values(calendarData).flat().map((employee)=>employee.organization).filter(Boolean))).sort(),[calendarData])

const moveAssignCalendarMonth=(offset)=>{
const [year,month]=assignCalendarMonth.split("-").map(Number)
const next=new Date(year,month-1+offset,1)
setAssignCalendarMonth(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}`)
}

const assignCalendarMonthLabel=useMemo(()=>{
const [year,month]=assignCalendarMonth.split("-").map(Number)
return new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(year,month-1,1))
},[assignCalendarMonth])

/* ================= PENDING ================= */

const fetchPending = async()=>{

try{

const res = await api.get("/training-assign/pending")

const fetchedRows=res.data || []
const rows=embeddedApproval && initialApprovalId
? fetchedRows.filter((row)=>row.id===initialApprovalId)
: fetchedRows
setPendingList(rows)
if(embeddedApproval){
setSelectedRows(rows.length===1 && rows[0].canApprove ? [rows[0].id] : [])
}
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
setNotice({severity:"success",text:"Selected request approved and forwarded to the next stage, or completed if this was the final stage."})
await Promise.all([fetchPending(),fetchHistory()])
onApprovalChanged?.()
}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || err?.message || "Training approval could not be completed."})
}
}

const rejectTraining = async()=>{
const reason=window.prompt("Reason for rejecting the selected training request(s):","")
if(reason===null) return
try{
await api.post("/training-assign/reject",{ids:selectedRows,reason:reason.trim() || "Not approved"})
setSelectedRows([])
setNotice({severity:"success",text:"Selected training request(s) rejected."})
await Promise.all([fetchPending(),fetchHistory()])
onApprovalChanged?.()
}catch(err){
setNotice({severity:"error",text:err?.response?.data?.detail || err?.message || "Training rejection could not be completed."})
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
const request=++historyRequest.current
setHistoryBusy(true)
setHistoryError("")
try {
const [res,programmeRes]=await Promise.all([
api.get("/training-assign/history",{params:{financialYear:historyFY}}),
historyFY ? api.get(`/Training_holiday/training/${historyFY}`) : Promise.resolve({data:[]})
])
if(request!==historyRequest.current) return
setHistory(res.data || [])
setMatrixTrainingList(programmeRes.data || [])
} catch(error) {
if(request===historyRequest.current) setHistoryError(error.response?.data?.detail || "Unable to load nomination history")
} finally {
if(request===historyRequest.current) setHistoryBusy(false)
}
}

useEffect(()=>{
if(canViewTrainingPage) fetchHistory()
},[historyFY,selectedFY,canViewTrainingPage])

const visibleHistory=history.filter(row => `${row.employeeName || ""} ${row.employeeId || ""} ${row.groupName || ""}`.toLowerCase().includes(historyEmployee.toLowerCase()))

const trainingHistory=useMemo(()=>(history || []).filter((row)=>(row.workflowKind || "Training")==="Training"),[history])

const matrixStatuses=useMemo(()=>Array.from(new Set(trainingHistory.map((row)=>row.status).filter(Boolean))).sort(),[trainingHistory])

const nominationMatrix=useMemo(()=>{
const rows=matrixStatus==="All" ? trainingHistory : trainingHistory.filter((row)=>row.status===matrixStatus)
const nominatedProgrammeNames=new Set(trainingHistory.map((row)=>row.trainingName || "Unnamed training"))
const today=new Date().toISOString().slice(0,10)
const zeroNominationUpcoming=matrixTrainingList.filter((programme)=>{
const name=programme.trainingName || "Unnamed training"
return Boolean(programme.startDate && programme.startDate>=today && !nominatedProgrammeNames.has(name))
}).sort((a,b)=>String(a.startDate || "").localeCompare(String(b.startDate || "")) || String(a.trainingName || "").localeCompare(String(b.trainingName || "")))
const zeroNominationUpcomingNames=Array.from(new Set(zeroNominationUpcoming.map((programme)=>programme.trainingName || "Unnamed training")))
const zeroNominationUpcomingSet=new Set(zeroNominationUpcomingNames)
const nominatedProgrammes=Array.from(new Set(rows.map((row)=>row.trainingName || "Unnamed training"))).filter((name)=>!zeroNominationUpcomingSet.has(name)).sort((a,b)=>a.localeCompare(b))
const programmes=[...zeroNominationUpcomingNames,...nominatedProgrammes]
const programmeDetails=Object.fromEntries(matrixTrainingList.map((programme)=>[programme.trainingName || "Unnamed training",programme]))
const employees=new Map()

const duration=(row)=>{
const importedDays=Number(row.trainingDays || 0)
if(importedDays>0) return importedDays
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
programmeDetails,
zeroNominationUpcomingNames,
employees:Array.from(employees.values()).sort((a,b)=>a.employeeName.localeCompare(b.employeeName)),
nominationCount:rows.length,
approvedCount:rows.filter((row)=>row.status==="Approved").length,
}
},[trainingHistory,matrixStatus,matrixTrainingList])

const trainingDaysSx=(days)=>{
const value=Number(days || 0)
if(value>=7) return {background:"#166534",color:"#FFFFFF",border:"1px solid #14532D"}
if(value>5) return {background:"#BBF7D0",color:"#166534",border:"1px solid #4ADE80"}
if(value>3) return {background:"#FEF08A",color:"#854D0E",border:"1px solid #FACC15"}
return {background:"#FEE2E2",color:"#991B1B",border:"1px solid #FCA5A5"}
}

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
const period=item.startDate===item.endDate || !item.endDate ? item.startDate || item.trainingDate || item.financialYear || "FY only" : `${item.startDate} to ${item.endDate}`
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

const trainingSectionMeta={
holiday:{title:"Holiday event master",subtitle:"Create and maintain the published holiday calendar.",accent:"#6D28D9"},
training:{title:"Training event master",subtitle:"Create and maintain programmes available for nomination.",accent:"#0F766E"},
request:{title:"Apply for training",subtitle:"Request an available programme through your configured approval route.",accent:"#7C3AED"},
assign:{title:"Assign training",subtitle:"Nominate an eligible employee for an available programme.",accent:"#17876D"},
mytraining:{title:"My approved training",subtitle:"Review approved programmes and request an adjacent roster OFF where applicable.",accent:"#047857"},
pending:{title:isTrainingHR ? "Training final approval" : "Training approval inbox",subtitle:isTrainingHR ? "Complete HR review for nominations across departments." : "Review nominations currently assigned to you.",accent:"#D97706",count:pendingList.length},
history:{title:"Training nomination history",subtitle:"Review nomination records and the training coverage matrix.",accent:"#4338CA"},
}
const currentTrainingSection=trainingSectionMeta[activeSection] || trainingSectionMeta.request

return(

<Box sx={{p:embeddedRequest || embeddedApproval ? 0 : activeSection==="history" ? 1.5 : 3,background:embeddedRequest || embeddedApproval ? "transparent" : "#f4f6fb",minHeight:embeddedRequest || embeddedApproval || activeSection==="history" ? 0 : "100vh"}}>

{/* HEADER */}

{!embeddedRequest && !embeddedApproval && <Box sx={{mb:2}}><WorkflowHeader title={currentTrainingSection.title} subtitle={currentTrainingSection.subtitle} accent={currentTrainingSection.accent} count={currentTrainingSection.count} /></Box>}

{notice && <Alert severity={notice.severity} onClose={()=>setNotice(null)} sx={{mb:2}}>{notice.text}</Alert>}

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
            disabled={!canManageTrainingPrograms}
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
            disabled={!canManageTrainingPrograms}
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
            disabled={!canManageTrainingPrograms}
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
            disabled={!canManageTrainingPrograms}
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
            disabled={!canManageTrainingPrograms}
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
                backgroundColor:(t.unmatchedEmployees || []).length ? "#FFF1F2" : undefined,
                "&:nth-of-type(odd)": {backgroundColor:(t.unmatchedEmployees || []).length ? "#FFE4E6" : "#f9fcff"}
              }}
            >

              <TableCell><Typography sx={{fontSize:13,fontWeight:750}}>{t.trainingName}</Typography>{(t.unmatchedEmployees || []).length>0 && <Tooltip title={`Employee not found: ${t.unmatchedEmployees.map((item)=>item.name || item.employeeName || item).join(", ")}`}><Chip size="small" label={`${t.unmatchedEmployees.length} employee assignment(s) pending`} sx={{mt:.6,height:22,background:"#DC2626",color:"#FFF",fontSize:10,fontWeight:900}}/></Tooltip>}</TableCell>
              <TableCell>{t.location || "-"}</TableCell>
              <TableCell>{t.startDate || (t.historicalImport ? t.financialYear || "FY only" : "-")}</TableCell>
              <TableCell>{t.endDate || (t.durationDays ? `${t.durationDays} day(s)` : "-")}</TableCell>
              <TableCell><Button size="small" variant="outlined" disabled={!canManageTrainingPrograms} onClick={()=>editTraining(t)}>Edit dates/location</Button></TableCell>

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

{/* ================= SELF REQUEST ================= */}

<Collapse in={activeSection==="request"} timeout={420} unmountOnExit>
<Box id="training-workspace-request" sx={{scrollMarginTop:110}}>
<Paper elevation={0} sx={{p:3,mb:4,borderRadius:3,border:"1px solid #DDD6FE",background:"linear-gradient(135deg,#FFFFFF,#F5F3FF)"}}>
<Typography variant="h6" sx={{fontWeight:900,color:"#5B21B6"}}>Request an available training</Typography>
<Typography variant="body2" color="text.secondary" sx={{mt:.5,mb:2.5}}>For {initialEmployeeName || user?.name || "you"}{initialEmployeeId ? ` (${initialEmployeeId})` : ""}. Programme dates apply. Your request follows the configured approval route.</Typography>
<Grid container spacing={2} alignItems="center">
<Grid item xs={12} md={7}>
<TextField select fullWidth label="Training programme" value={requestedTraining} onChange={(event)=>setRequestedTraining(event.target.value)}>
{trainingList.filter((item)=>!["inactive","cancelled","deleted"].includes(String(item.status || "").toLowerCase()) && (!item.endDate || item.endDate>=new Date().toISOString().slice(0,10))).map((item)=><MenuItem key={item.id} value={item.trainingName}>
{item.trainingName} · {item.startDate} to {item.endDate}{item.location ? ` · ${item.location}` : ""}
</MenuItem>)}
</TextField>
</Grid>
<Grid item xs={12} md={3}><Button fullWidth variant="contained" disabled={!requestedTraining || requestSaving} onClick={requestOwnTraining} sx={{height:56,borderRadius:2,background:"#6D28D9",fontWeight:900,"&:hover":{background:"#5B21B6"}}}>{requestSaving ? "Submitting…" : "Submit request"}</Button></Grid>
</Grid>
</Paper>
</Box>
</Collapse>

{/* ================= ASSIGN ================= */}

<Collapse in={activeSection==="assign"} timeout={420} unmountOnExit>
<Box id="training-workspace-assign" sx={{scrollMarginTop:110}}>
{canAssignTraining && (
<Paper elevation={0} sx={{mb:4,borderRadius:3,border:"1px solid #D9E7F5",overflow:"hidden",boxShadow:"0 12px 34px rgba(15,23,42,.08)"}}>
<Box
  sx={{
    px:{xs:2,md:2.5},
    py:2,
    color:"#FFFFFF",
    background:"linear-gradient(105deg,#064E3B 0%,#0F766E 62%,#10B981 100%)",
    display:"flex",
    justifyContent:"space-between",
    alignItems:{xs:"flex-start",md:"center"},
    gap:2,
    flexDirection:{xs:"column",md:"row"},
  }}
>
  <Box sx={{display:"flex",alignItems:"center",gap:1.2}}>
    <Box sx={{width:42,height:42,borderRadius:2.5,display:"grid",placeItems:"center",background:"rgba(255,255,255,.15)"}}>
      <CalendarDays size={22}/>
    </Box>
    <Box>
      <Typography sx={{fontSize:19,fontWeight:950}}>Training calendar</Typography>
      <Typography sx={{fontSize:11.5,color:"rgba(255,255,255,.82)"}}>Select a programme directly from its date to assign employees, edit it, or add sports &amp; nominations.</Typography>
    </Box>
  </Box>
  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
  {canManageTrainingPrograms && (
    <Button
      variant="contained"
      startIcon={<Plus size={16}/>}
      onClick={()=>openProgrammeEditor(null,new Date().toISOString().slice(0,10))}
      sx={{background:"#FFFFFF",color:"#0F766E",textTransform:"none",fontWeight:900,"&:hover":{background:"rgba(255,255,255,.9)"}}}
    >
      Add programme
    </Button>
  )}
  {canManageSportsEvents && (
    <Button
      variant="outlined"
      startIcon={<Medal size={16}/>}
      onClick={()=>openSportsEditor(new Date().toISOString().slice(0,10))}
      sx={{color:"#FFF",borderColor:"rgba(255,255,255,.72)",textTransform:"none",fontWeight:850,"&:hover":{borderColor:"#FFF",background:"rgba(255,255,255,.08)"}}}
    >
      Add sports
    </Button>
  )}
  {canAssignTraining && (
    <Button
      variant="outlined"
      onClick={()=>window.location.assign("/crew/training?section=history")}
      sx={{color:"#FFF",borderColor:"rgba(255,255,255,.72)",textTransform:"none",fontWeight:850,"&:hover":{borderColor:"#FFF",background:"rgba(255,255,255,.08)"}}}
    >
      Employee matrix
    </Button>
  )}
  {canDelegateTraining && (
    <Button
      variant="outlined"
      onClick={openTrainingDelegation}
      sx={{color:"#FFF",borderColor:"rgba(255,255,255,.72)",textTransform:"none",fontWeight:850,"&:hover":{borderColor:"#FFF",background:"rgba(255,255,255,.08)"}}}
    >
      Delegate power
    </Button>
  )}
  </Stack>
</Box>

<Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"minmax(0,1fr) 285px"},minHeight:650}}>
<Box sx={{p:{xs:1.25,md:2},minWidth:0}}>
<Box sx={{mb:1.5,display:"flex",alignItems:"center",justifyContent:"space-between",gap:1,flexWrap:"wrap"}}>
<Stack direction="row" spacing={.6} alignItems="center"><IconButton size="small" onClick={()=>moveAssignCalendarMonth(-1)} sx={{border:"1px solid #CBD5E1",borderRadius:2}}><ChevronLeft size={18}/></IconButton><Typography sx={{minWidth:165,textAlign:"center",fontSize:16,fontWeight:950,color:"#0F172A"}}>{assignCalendarMonthLabel}</Typography><IconButton size="small" onClick={()=>moveAssignCalendarMonth(1)} sx={{border:"1px solid #CBD5E1",borderRadius:2}}><ChevronRight size={18}/></IconButton></Stack>
<Stack direction="row" spacing={1} alignItems="center"><TextField size="small" type="month" value={assignCalendarMonth} onChange={(event)=>setAssignCalendarMonth(event.target.value)} sx={{width:155,"& .MuiOutlinedInput-root":{height:38}}}/><Button size="small" variant="outlined" onClick={()=>setAssignCalendarMonth(new Date().toISOString().slice(0,7))} sx={{height:38,textTransform:"none",fontWeight:850}}>Today</Button></Stack>
</Box>

<Box sx={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",borderTop:"1px solid #D9E2EC",borderLeft:"1px solid #D9E2EC",borderRadius:2,overflow:"hidden"}}>
{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day)=><Box key={day} sx={{py:.8,borderRight:"1px solid #D9E2EC",borderBottom:"1px solid #D9E2EC",background:"#F1F5F9",textAlign:"center",color:"#475569",fontSize:10.5,fontWeight:950,textTransform:"uppercase",letterSpacing:.5}}>{day}</Box>)}
{assignCalendarDays.map((day)=>{
const overflow=day.programmes.length>3
return <Box key={day.date} sx={{position:"relative",minHeight:{xs:94,md:116},p:.7,borderRight:"1px solid #D9E2EC",borderBottom:"1px solid #D9E2EC",background:day.today ? "#EFF6FF" : day.currentMonth ? "#FFFFFF" : "#F8FAFC",opacity:day.currentMonth ? 1 : .58,overflow:"hidden","&:hover .day-quick-add":{opacity:1}}}>
<Box sx={{mb:.45,display:"flex",justifyContent:"space-between",alignItems:"center"}}><Box sx={{width:24,height:24,borderRadius:"50%",display:"grid",placeItems:"center",background:day.today ? "#2563EB" : "transparent",color:day.today ? "#FFF" : "#334155",fontSize:11,fontWeight:950}}>{day.day}</Box><Stack direction="row" spacing={.3} alignItems="center">{day.programmes.length>0 && <Typography sx={{fontSize:8.5,color:"#64748B",fontWeight:850}}>{day.programmes.length}</Typography>}{canManageSportsEvents && <Tooltip title="Add sports event" arrow><IconButton className="day-quick-add" size="small" onClick={()=>openSportsEditor(day.date)} sx={{opacity:0,p:0.2,transition:"opacity .12s ease",color:"#6D28D9"}}><Medal size={13}/></IconButton></Tooltip>}{canManageTrainingPrograms && <Tooltip title="Add training programme" arrow><IconButton className="day-quick-add" size="small" onClick={()=>openProgrammeEditor(null,day.date)} sx={{opacity:0,p:0.2,transition:"opacity .12s ease",color:"#0F766E"}}><Plus size={13}/></IconButton></Tooltip>}</Stack></Box>
<Stack spacing={.4}>{day.programmes.slice(0,3).map((item)=>{
const selected=selectedTraining===item.trainingName
const color=trainingLineColor(item.trainingName)
const nomineeNames=selected ? (nominatedEmployeesByDate[day.date] || []).map((person)=>person.name).filter(Boolean) : []
return <Tooltip key={`${day.date}-${item.id || item.trainingName}`} title={`${item.trainingName} · ${item.location || "Location not specified"} · ${item.startDate} to ${item.endDate || item.startDate}${canManageTrainingPrograms ? " · Click the pencil to edit" : ""}`} arrow><Box sx={{position:"relative"}}><Box component="button" type="button" onClick={()=>setSelectedTraining(item.trainingName)} sx={{width:"100%",p:.55,pr:canManageTrainingPrograms ? 2.4 : .55,border:selected ? `2px solid ${color}` : `1px solid ${color}33`,borderLeft:`4px solid ${color}`,borderRadius:1.2,background:selected ? `${color}18` : `${color}0D`,color:"#172033",textAlign:"left",cursor:"pointer",overflow:"hidden","&:hover":{background:`${color}20`,transform:"translateY(-1px)"},transition:"all .12s ease"}}><Typography sx={{fontSize:9.5,fontWeight:950,lineHeight:1.15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.trainingName}</Typography><Typography sx={{mt:.2,fontSize:8.2,color:"#64748B",fontWeight:750,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.location || "Place not specified"}</Typography>{selected && nomineeNames.length>0 && <Typography sx={{mt:.35,fontSize:8,color:"#047857",fontWeight:900,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nomineeNames.length} nominated · {nomineeNames.slice(0,2).join(", ")}{nomineeNames.length>2 ? "…" : ""}</Typography>}</Box>{canManageTrainingPrograms && <IconButton size="small" onClick={(event)=>editProgrammeFromCard(item,event)} sx={{position:"absolute",top:2,right:2,p:0.25,color,background:"rgba(255,255,255,.75)","&:hover":{background:"#FFFFFF"}}}><Pencil size={11}/></IconButton>}</Box></Tooltip>
})}{overflow && <Typography sx={{pl:.5,fontSize:8.5,color:"#475569",fontWeight:900}}>+{day.programmes.length-3} more</Typography>}</Stack>
</Box>
})}
</Box>
</Box>

<Box sx={{p:2,borderLeft:{lg:"1px solid #D9E2EC"},borderTop:{xs:"1px solid #D9E2EC",lg:0},background:"linear-gradient(180deg,#F8FAFC,#FFFFFF)"}}>
<Typography sx={{fontSize:12,fontWeight:950,color:"#334155",textTransform:"uppercase",letterSpacing:.5}}>Selected training</Typography>
{selectedTrainingProgramme ? <Paper variant="outlined" sx={{mt:1.2,p:1.6,borderRadius:2.5,borderColor:`${trainingLineColor(selectedTrainingProgramme.trainingName)}55`,borderTop:`5px solid ${trainingLineColor(selectedTrainingProgramme.trainingName)}`}}><Typography sx={{fontSize:15,fontWeight:950,color:"#0F172A",lineHeight:1.25}}>{selectedTrainingProgramme.trainingName}</Typography><Stack spacing={.8} sx={{mt:1.3}}><Stack direction="row" spacing={.8} alignItems="flex-start"><CalendarDays size={15} color="#64748B"/><Typography sx={{fontSize:11.5,fontWeight:800,color:"#475569"}}>{selectedTrainingProgramme.startDate} to {selectedTrainingProgramme.endDate || selectedTrainingProgramme.startDate}</Typography></Stack><Stack direction="row" spacing={.8} alignItems="flex-start"><MapPin size={15} color="#64748B"/><Typography sx={{fontSize:11.5,fontWeight:800,color:"#475569"}}>{selectedTrainingProgramme.location || "Place not specified"}</Typography></Stack></Stack><Button fullWidth variant="contained" startIcon={<Users size={16}/>} onClick={()=>fetchCalendarDuty(selectedTrainingProgramme.trainingName,selectedTrainingProgramme.startDate,selectedTrainingProgramme.endDate)} sx={{mt:1.7,py:1,textTransform:"none",fontWeight:950,borderRadius:2,background:"#0F766E","&:hover":{background:"#065F46"}}}>Assign employees</Button>{canManageTrainingPrograms && <Button fullWidth variant="outlined" startIcon={<Pencil size={15}/>} onClick={()=>openProgrammeEditor(selectedTrainingProgramme)} sx={{mt:1,textTransform:"none",fontWeight:850}}>Edit training details</Button>}</Paper> : <Box sx={{mt:1.2,p:2.2,border:"1px dashed #94A3B8",borderRadius:2.5,textAlign:"center",color:"#64748B"}}><CalendarDays size={30}/><Typography sx={{mt:.8,fontSize:12,fontWeight:900}}>Select a training on the calendar</Typography><Typography sx={{mt:.4,fontSize:10.5}}>Training name and place are displayed directly against the scheduled dates.</Typography></Box>}

<Typography sx={{mt:2.2,mb:.8,fontSize:11,fontWeight:950,color:"#475569",textTransform:"uppercase",letterSpacing:.45}}>Programmes this month</Typography>
<Stack spacing={.7} sx={{maxHeight:285,overflowY:"auto",pr:.3}}>{activeTrainingProgrammes.filter((item)=>item.startDate<=`${assignCalendarMonth}-31` && (item.endDate || item.startDate)>=`${assignCalendarMonth}-01`).sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate))).map((item)=><Box component="button" type="button" key={item.id || item.trainingName} onClick={()=>setSelectedTraining(item.trainingName)} sx={{p:1,width:"100%",border:"1px solid #E2E8F0",borderLeft:`4px solid ${trainingLineColor(item.trainingName)}`,borderRadius:1.5,background:selectedTraining===item.trainingName ? "#ECFDF5" : "#FFF",textAlign:"left",cursor:"pointer"}}><Typography sx={{fontSize:10.5,fontWeight:950,color:"#1E293B"}}>{item.trainingName}</Typography><Typography sx={{mt:.15,fontSize:9.2,color:"#64748B",fontWeight:750}}>{item.startDate} · {item.location || "Place not specified"}</Typography></Box>)}{!activeTrainingProgrammes.some((item)=>item.startDate<=`${assignCalendarMonth}-31` && (item.endDate || item.startDate)>=`${assignCalendarMonth}-01`) && <Typography sx={{py:2,textAlign:"center",fontSize:11,color:"#94A3B8",fontWeight:750}}>No training scheduled this month.</Typography>}</Stack>
</Box>
</Box>
</Paper>
)}
</Box>
</Collapse>


<Dialog open={delegationOpen} onClose={()=>setDelegationOpen(false)} maxWidth="sm" fullWidth>
<DialogTitle sx={{fontWeight:900}}>Delegate training nomination power</DialogTitle>
<DialogContent dividers>
<Alert severity="info" sx={{mb:2}}>Only your mapped subordinates are listed. A delegated employee can nominate people within the same reporting department. HR remains the only approving authority.</Alert>
{delegationLoading ? <Box sx={{display:"grid",placeItems:"center",py:5}}><CircularProgress /></Box> : <Stack spacing={1}>
{delegationRows.length===0 && <Typography color="text.secondary" align="center" sx={{py:3}}>No mapped subordinate is available for delegation.</Typography>}
{delegationRows.map((row)=><Paper key={row.employeeId} variant="outlined" sx={{p:1.4,display:"flex",alignItems:"center",justifyContent:"space-between",gap:2,borderRadius:2}}>
<Box><Typography sx={{fontWeight:900}}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.employeeId} · {row.designation || "Designation not set"}</Typography></Box>
<Button size="small" color={row.delegated ? "error" : "primary"} variant={row.delegated ? "outlined" : "contained"} onClick={()=>toggleTrainingDelegation(row)}>{row.delegated ? "Withdraw" : "Delegate"}</Button>
</Paper>)}
</Stack>}
</DialogContent>
<DialogActions><Button onClick={()=>setDelegationOpen(false)}>Close</Button></DialogActions>
</Dialog>


{/* ############### Duty Matrix Popup (Full Section) */}


<Dialog open={Boolean(programmeEditor)} onClose={()=>{if(!programmeBusy){setProgrammeEditor(null);setProgrammeError("")}}} maxWidth="sm" fullWidth>
<DialogTitle sx={{fontWeight:900,display:"flex",alignItems:"center",gap:1}}><Pencil size={18}/>{programmeEditor?.mode==="edit" ? "Edit training programme" : "Add training programme"}</DialogTitle>
<DialogContent dividers>
<Stack spacing={2} sx={{pt:.5}}>
{programmeError && <Alert severity="error" onClose={()=>setProgrammeError("")}>{programmeError}</Alert>}
<TextField fullWidth size="small" label="Training name" value={programmeForm.trainingName} disabled={programmeBusy} onChange={(e)=>setProgrammeForm((v)=>({...v,trainingName:e.target.value}))} slotProps={{htmlInput:{maxLength:200}}}/>
<TextField fullWidth size="small" label="Location / venue" value={programmeForm.location} disabled={programmeBusy} onChange={(e)=>setProgrammeForm((v)=>({...v,location:e.target.value}))} slotProps={{htmlInput:{maxLength:300}}}/>
<Stack direction={{xs:"column",sm:"row"}} spacing={2}>
<TextField fullWidth size="small" type="date" label="Start date" InputLabelProps={{shrink:true}} value={programmeForm.startDate} disabled={programmeBusy} onChange={(e)=>setProgrammeForm((v)=>({...v,startDate:e.target.value}))}/>
<TextField fullWidth size="small" type="date" label="End date" InputLabelProps={{shrink:true}} inputProps={{min:programmeForm.startDate}} value={programmeForm.endDate} disabled={programmeBusy} onChange={(e)=>setProgrammeForm((v)=>({...v,endDate:e.target.value}))}/>
</Stack>
<Alert severity="info" sx={{py:0}}>Programme dates drive the calendar blocks. Editing the name, location or dates updates what every nominate view shows for this financial year ({selectedFY}).</Alert>
<Stack direction="row" spacing={1}>
<Button variant="contained" disabled={programmeBusy} onClick={saveProgramme}>{programmeBusy ? "Saving…" : programmeEditor?.mode==="edit" ? "Save changes" : "Add programme"}</Button>
<Button disabled={programmeBusy} onClick={()=>setProgrammeEditor(null)}>Cancel</Button>
{programmeEditor?.mode==="edit" && <Button color="error" variant="outlined" startIcon={<Trash2 size={15}/>} disabled={programmeBusy} onClick={deleteProgramme} sx={{ml:"auto"}}>Delete</Button>}
</Stack>
</Stack>
</DialogContent>
</Dialog>

<Dialog open={Boolean(sportsEditor)} onClose={()=>{if(!sportsBusy){setSportsEditor(null);setSportsError("")}}} maxWidth="sm" fullWidth>
<DialogTitle sx={{fontWeight:900,display:"flex",alignItems:"center",gap:1}}><Medal size={18}/>Add sports event</DialogTitle>
<DialogContent dividers>
<Stack spacing={2} sx={{pt:.5}}>
{sportsError && <Alert severity="error" onClose={()=>setSportsError("")}>{sportsError}</Alert>}
<Alert severity="info" sx={{py:0}}>Sports events are published to the sports workflow. Employees can then apply against this event; approved applications appear on the duty calendar.</Alert>
<TextField fullWidth size="small" label="Event name" value={sportsForm.name} disabled={sportsBusy} onChange={(e)=>setSportsForm((v)=>({...v,name:e.target.value}))}/>
<Stack direction={{xs:"column",sm:"row"}} spacing={2}>
<TextField fullWidth size="small" type="date" label="From" InputLabelProps={{shrink:true}} value={sportsForm.startDate} disabled={sportsBusy} onChange={(e)=>setSportsForm((v)=>({...v,startDate:e.target.value}))}/>
<TextField fullWidth size="small" type="date" label="To" InputLabelProps={{shrink:true}} inputProps={{min:sportsForm.startDate}} value={sportsForm.endDate} disabled={sportsBusy} onChange={(e)=>setSportsForm((v)=>({...v,endDate:e.target.value}))}/>
</Stack>
<TextField fullWidth size="small" label="Venue" value={sportsForm.venue} disabled={sportsBusy} onChange={(e)=>setSportsForm((v)=>({...v,venue:e.target.value}))}/>
<TextField fullWidth size="small" label="Description" multiline minRows={2} value={sportsForm.description} disabled={sportsBusy} onChange={(e)=>setSportsForm((v)=>({...v,description:e.target.value}))}/>
<Stack direction="row" spacing={1}>
<Button variant="contained" disabled={sportsBusy} onClick={saveSportsEvent}>{sportsBusy ? "Saving…" : "Add event"}</Button>
<Button disabled={sportsBusy} onClick={()=>setSportsEditor(null)}>Cancel</Button>
</Stack>
</Stack>
</DialogContent>
</Dialog>


<Dialog open={Boolean(reviewNomination)} onClose={()=>setReviewNomination(null)} fullWidth maxWidth="sm">
<DialogTitle>Manage training nomination</DialogTitle>
<DialogContent dividers>{reviewNomination && <TrainingCalendarReview key={`${reviewNomination.id}-${reviewNomination.startDate || ""}`} requestId={reviewNomination.id} proposedStartDate={reviewNomination.startDate} onChanged={()=>{fetchPending();fetchHistory();if(selectedTraining)fetchCalendarDuty(selectedTraining,"","",false)}}/>}</DialogContent>
<DialogActions><Button onClick={()=>setReviewNomination(null)}>Close</Button></DialogActions>
</Dialog>
<Dialog open={calendarOpen} maxWidth="xl" fullWidth>

<DialogTitle sx={{pb:1}}><Typography variant="caption" color="text.secondary">Click a nomination to manage it. Drag an editable nomination along the same employee row to propose new dates; confirm before saving.</Typography>
<Typography sx={{fontSize:20,fontWeight:900}}>Select shift or non-shift employees</Typography>
{(()=>{const item=trainingList.find((entry)=>entry.trainingName===selectedTraining); return item ? <Typography variant="body2" color="text.secondary">{item.trainingName} · {item.startDate} to {item.endDate} · {item.location || "Location not specified"}</Typography> : null})()}
</DialogTitle>

<DialogContent>

<Box sx={{display:"flex",gap:1,mb:2,position:"sticky",top:0,zIndex:5,py:1,background:"#FFFFFF"}}>
{["All","Shift","Non-shift"].map((value)=><Button key={value} size="small" variant={employeeTypeFilter===value ? "contained" : "outlined"} onClick={()=>setEmployeeTypeFilter(value)}>{value} employees</Button>)}
<TextField select size="small" label="Department" value={departmentFilter} onChange={(event)=>setDepartmentFilter(event.target.value)} sx={{minWidth:210}}>
<MenuItem value="All">All departments</MenuItem>
{availableDepartments.map((department)=><MenuItem key={department} value={department}>{department}</MenuItem>)}
</TextField>
<Stack direction="row" spacing={1} alignItems="center" sx={{ml:1}}><Chip size="small" label="Holiday" sx={{background:"#E9D5FF",color:"#6B21A8",border:"1px solid #A855F7",fontWeight:900}}/><Typography variant="caption">Full block: non-shift · H marker: shift duty continues</Typography></Stack>
<Chip sx={{ml:"auto"}} color="primary" label={`${selectedEmployees.length} selected`} />
</Box>

{Object.keys(calendarData).filter((group)=>calendarData[group].some((emp)=>(employeeTypeFilter==="All" || emp.employeeType===employeeTypeFilter) && (departmentFilter==="All" || emp.organization===departmentFilter))).map(group => (

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
const holidayName=calendarHolidayMap[date]
return <TableCell key={date} title={holidayName || undefined} align="center" sx={{background:holidayName ? "#F3E8FF" : highlighted ? "#D1FAE5" : undefined,color:holidayName ? "#6B21A8" : highlighted ? "#065F46" : undefined,fontWeight:highlighted || holidayName ? 900 : 600,borderBottom:holidayName ? "3px solid #A855F7" : undefined}}>
{date}{holidayName && <Typography variant="caption" sx={{display:"block",fontWeight:900}}>Holiday</Typography>}
</TableCell>
})}

<TableCell>Select</TableCell>
</TableRow>
</TableHead>

<TableBody>

{calendarData[group].filter((emp)=>(employeeTypeFilter==="All" || emp.employeeType===employeeTypeFilter) && (departmentFilter==="All" || emp.organization===departmentFilter)).map(emp => (

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
const isHoliday=Boolean(duty?.isHoliday)
const isNonShiftHoliday=isHoliday && emp.employeeType==="Non-shift"
const trainingLines=[...(duty?.trainingLines || [])]
if(isTrainingDate) trainingLines.push({id:"proposed",trainingName:selectedTraining,status:"Proposed"})
const uniqueTrainingLines=trainingLines.filter((line,index,list)=>list.findIndex((item)=>`${item.id}:${item.trainingName}`===`${line.id}:${line.trainingName}`)===index)

return(

<TableCell
key={date}
onDragOver={event=>{if(draggedNomination.current?.employeeId===emp.employeeId)event.preventDefault()}}
onDrop={event=>{event.preventDefault();const dragged=draggedNomination.current;draggedNomination.current=null;if(dragged?.employeeId===emp.employeeId)setReviewNomination({id:dragged.id,startDate:date})}}
align="center"
sx={{
position:"relative",
backgroundColor:
isNonShiftHoliday ? "#E9D5FF" :
hasLeave ? "#FFF1F2" :
shift==="Morning" ? "#E3F2FD" :
shift==="Evening" ? "#FFF3E0" :
shift==="Night" ? "#E8F5E9" :
shift==="OFF" ? "#FFEBEE" :
"#fff",
borderTop:isTrainingDate ? "3px solid #0F766E" : undefined,
borderLeft:isHoliday ? "4px solid #A855F7" : undefined,
minWidth:118
}}
>

{isHoliday && !isNonShiftHoliday && <Tooltip title={`${duty.holidayName || "Holiday"} · shift duty continues`} arrow><Box sx={{position:"absolute",top:3,right:3,width:16,height:16,borderRadius:"50%",display:"grid",placeItems:"center",background:"#9333EA",color:"#FFF",fontSize:8,fontWeight:950}}>H</Box></Tooltip>}

<Typography sx={{fontWeight:shift==="Training" ? 900 : 500}}>
{isNonShiftHoliday ? "Holiday" : shift}
</Typography>
{isNonShiftHoliday && <Typography variant="caption" title={duty.holidayName} sx={{display:"block",color:"#6B21A8",fontWeight:900}}>{duty.holidayName}</Typography>}
{uniqueTrainingLines.map((line)=><Tooltip key={`${line.id}-${line.trainingName}`} title={`${line.trainingName} · ${line.status || "Training"}`} arrow>
<Box component={line.id==="proposed" ? "div" : "button"} type={line.id==="proposed" ? undefined : "button"} draggable={Boolean(line.canEdit)} onDragStart={event=>{if(!line.canEdit)return;draggedNomination.current={id:line.id,employeeId:emp.employeeId};event.dataTransfer.setData("text/plain",line.id);event.dataTransfer.effectAllowed="move"}} onDragEnd={()=>{draggedNomination.current=null}} onClick={()=>{if(line.id!=="proposed")setReviewNomination({id:line.id})}} sx={{border:0,cursor:line.canEdit ? "grab" : "pointer",width:"100%",mt:.45,px:.65,py:.3,borderRadius:1,color:"#FFFFFF",background:trainingLineColor(line.trainingName),fontSize:9,fontWeight:900,lineHeight:1.2,whiteSpace:"normal"}}>{line.status==="Proposed" ? "Selected training" : `${line.trainingName} - ${line.status}`}</Box>
</Tooltip>)}
{uniqueTrainingLines.length>1 && <Chip size="small" label={`${uniqueTrainingLines.length} training overlap`} sx={{mt:.5,height:19,background:"#FEE2E2",color:"#991B1B",fontSize:9,fontWeight:950}} />}
{hasLeave && <Typography variant="caption" sx={{display:"block",color:"#DC2626",fontWeight:900}}>Leave: {duty.stationLeaveOnly ? "Station Leave" : `${duty.leaveType || duty.leaveStatus}${duty.stationLeave ? " + Station Leave" : ""}`}</Typography>}
{duty?.trainingName && uniqueTrainingLines.length===0 && (
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
disabled={!canAssignTraining || selectedEmployees.length===0}
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
<Typography variant="caption" sx={{display:"block",mt:.35,color:row.requestType==="Self Request" ? "#6D28D9" : "#03624C",fontWeight:850}}>
{row.requestType || "Assigned"}{row.nominatedBy?.name ? ` by ${row.nominatedBy.name}` : ""}
</Typography>
</TableCell>

<TableCell>
<Button size="small" variant="text" sx={{px:0,fontWeight:900}} onClick={()=>setExpandedApprovalId(expandedApprovalId===row.id?"":row.id)}>{row.financialYearTrainingDays || 0} / 7 days</Button>
</TableCell>

<TableCell>{row.status}</TableCell>

<TableCell>
<Typography sx={{fontSize:12,fontWeight:800}}>
{row.isHRFinalApproval ? "Awaiting authorized HR approver" : row.currentApproverName ? `Awaiting ${row.currentApproverName}` : "Hierarchy completed"}
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
{selectedRows.length && selectedRows.every((id)=>pendingList.find((row)=>row.id===id)?.isHRFinalApproval) ? "HR Final Approve" : "Approve & Forward"}
</Button>

<Button variant="outlined" color="error" sx={{borderRadius:2,fontWeight:700}} onClick={rejectTraining} disabled={!selectedRows.length}>
Reject Selected
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
<Paper elevation={0} sx={{p:{xs:1,md:2},borderRadius:2}}>

<Box sx={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:2,flexWrap:"wrap",mb:2.5}}>
<Box sx={{display:"flex",gap:1,p:.6,borderRadius:2,background:"#EEF2FF"}}>
<Button size="small" variant={historyView==="history" ? "contained" : "text"} onClick={()=>setHistoryView("history")} sx={{fontWeight:850,textTransform:"none"}}>Nomination History</Button>
<Button size="small" variant={historyView==="matrix" ? "contained" : "text"} onClick={()=>setHistoryView("matrix")} sx={{fontWeight:850,textTransform:"none"}}>Training Nomination Matrix</Button>
</Box>
{historyView==="matrix" && <Button variant="outlined" onClick={exportNominationMatrix} disabled={!nominationMatrix.employees.length} sx={{fontWeight:850,textTransform:"none"}}>Export full matrix CSV</Button>}
</Box>

<Box sx={{display:"flex",gap:1.5,flexWrap:"wrap",mb:2}}>

<TextField
size="small"
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
size="small"
label="Search name, ID or group"
value={historyEmployee}
onChange={(e)=>setHistoryEmployee(e.target.value)}
sx={{minWidth:200}}
/>

{historyView==="matrix" && <TextField size="small" select label="Nomination Status" value={matrixStatus} onChange={(e)=>setMatrixStatus(e.target.value)} sx={{minWidth:210}}>
<MenuItem value="All">All statuses</MenuItem>
{matrixStatuses.map((status)=><MenuItem key={status} value={status}>{status}</MenuItem>)}
</TextField>}

</Box>

{historyError ? <Alert severity="error" action={<Button onClick={fetchHistory}>Retry</Button>}>{historyError}</Alert> : historyBusy ? <Box sx={{p:6,textAlign:"center"}}><CircularProgress size={28}/></Box> : historyView==="history" ? <>
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

{visibleHistory.length===0 ?

<TableRow>
<TableCell colSpan={5} align="center">
No history found
</TableCell>
</TableRow>

:

visibleHistory.map(row => (

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

<TableCell>{row.approvalProgress || "-"}{!row.historicalImport && <Button size="small" onClick={()=>setReviewNomination({id:row.id})}>Manage nomination</Button>}</TableCell>

</TableRow>

))

}

</TableBody>

</Table>
</> : <>
<NominationMatrix onManage={item=>setReviewNomination({id:item.id})} matrix={nominationMatrix} search={historyEmployee} showTarget={Boolean(historyFY)} />
</>}

</Paper>

)}
</Box>
</Collapse>

</Box>

)

}
