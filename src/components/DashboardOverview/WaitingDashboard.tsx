import { Box, Button } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers'
import React, { useState } from 'react'

const WaitingDashboard = () => {
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());

    const handleFetch = () => {
        console.log(fromDate, toDate);
    }

    return (
        <div>
            <div className='flex items-center gap-10'>
                <Box
                    sx={{
                        
                    }}
                >
                    <DatePicker
                        label="From"
                        value={fromDate}
                        slotProps={{ textField: { size: 'small' } }}
                    />
                    <DatePicker
                        label="To"
                        value={toDate}
                        slotProps={{ textField: { size: 'small' } }}
                    />
                    <Button variant="contained" onClick={handleFetch}>Fetch</Button>
                </Box>
            </div>
        </div>
    )
}

export default WaitingDashboard