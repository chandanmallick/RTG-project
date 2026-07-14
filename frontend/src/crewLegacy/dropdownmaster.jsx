import React, { useState, useEffect } from "react";
import api from "./api";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from "@mui/material";

export default function DropdownMaster() {

  const [type, setType] = useState("");
  const [value, setValue] = useState("");
  const [dropdownList, setDropdownList] = useState([]);

  // Fetch values from backend
  const fetchDropdownValues = async (selectedType) => {
    if (!selectedType) {
      setDropdownList([]);
      return;
    }

    try {
      const res = await api.get(`/admin/dropdown/${selectedType}`);
      setDropdownList(res.data);
    } catch (error) {
      console.error("Fetch error:", error);
    }
  };

  // Fetch whenever dropdown type changes
  useEffect(() => {
    fetchDropdownValues(type);
  }, [type]);

  const handleSubmit = async () => {
    if (!type || !value) return;

    try {
      await api.post(`/admin/dropdown`, {
        type,
        value
      });

      setValue("");
      fetchDropdownValues(type); // Refresh from backend
    } catch (error) {
      console.error("Insert error:", error);
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Dropdown Master
      </Typography>

      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2}>

          <Grid item xs={12} md={4}>
            <TextField
              select
              label="Dropdown Type"
              fullWidth
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <MenuItem value="dutyType">Duty Type</MenuItem>
              <MenuItem value="category">Category</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              label="New Value"
              fullWidth
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <Button variant="contained" onClick={handleSubmit}>
              Add Value
            </Button>
          </Grid>

        </Grid>
      </Paper>

      <Typography variant="h6">Existing Values</Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{backgroundColor: "#d9f2d9"}}>
              <TableCell><strong>Value</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dropdownList.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.value}</TableCell>
              </TableRow>
            ))}

            {dropdownList.length === 0 && (
              <TableRow>
                <TableCell align="center">
                  No values available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

