use std::ffi::c_void;

#[repr(C)]
#[derive(Default, Clone, Copy)]
pub struct SystemTime {
    pub year: u16,
    pub month: u16,
    pub weekday: u16,
    pub day: u16,
    pub hour: u16,
    pub minute: u16,
    pub second: u16,
    pub millis: u16,
}

#[link(name = "kernel32")]
extern "system" {
    fn GetLocalTime(time: *mut SystemTime);
}

pub fn local_time() -> SystemTime {
    unsafe {
        let mut now = SystemTime::default();
        GetLocalTime(&mut now);
        now
    }
}

pub fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

pub fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn local_offset() -> i64 {
    let now = local_time();
    let days = days_from_civil(now.year as i64, now.month as i64, now.day as i64);
    let local =
        days * 86400 + now.hour as i64 * 3600 + now.minute as i64 * 60 + now.second as i64;
    let utc = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or(0);
    local - utc
}

pub fn clock(timestamp: i64, offset: i64) -> String {
    let total = timestamp + offset;
    let seconds = total.rem_euclid(86400);
    format!("{:02}:{:02}", seconds / 3600, (seconds % 3600) / 60)
}

pub fn stamp(timestamp: i64, offset: i64, with_date: bool) -> String {
    let total = timestamp + offset;
    let days = total.div_euclid(86400);
    let value = clock(timestamp, offset);
    if !with_date {
        return value;
    }
    let (year, month, day) = civil_from_days(days);
    format!("{:04}-{:02}-{:02} {}", year, month, day, value)
}

#[allow(dead_code)]
pub fn unused(_: *mut c_void) {}
