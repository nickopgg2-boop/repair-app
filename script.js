// ดึงข้อมูลจาก LocalStorage ถ้าไม่มีให้เป็น Array ว่าง
let jobs = JSON.parse(localStorage.getItem('maintenanceJobs')) || [];

// อ้างอิง Elements ที่ต้องใช้งาน
const jobListEl = document.getElementById('job-list');
const countTotalEl = document.getElementById('count-total');
const countPendingEl = document.getElementById('count-pending');
const countCompletedEl = document.getElementById('count-completed');

const modal = document.getElementById('modal');
const btnOpenModal = document.getElementById('btn-open-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnSaveJob = document.getElementById('btn-save-job');
const jobTypeInput = document.getElementById('job-type');

// ฟังก์ชันเริ่มต้น (Render หน้าเว็บ)
function init() {
    renderDashboard();
    renderJobs();
}

// อัปเดต Dashboard
function renderDashboard() {
    const total = jobs.length;
    const completed = jobs.filter(job => job.status === 'เสร็จ').length;
    const pending = total - completed;

    countTotalEl.textContent = total;
    countPendingEl.textContent = pending;
    countCompletedEl.textContent = completed;
}

// อัปเดตรายการใบงาน
function renderJobs() {
    jobListEl.innerHTML = ''; // ล้างค่าเดิม
    
    // เรียงให้งานล่าสุดอยู่บนสุด
    const sortedJobs = [...jobs].reverse();

    if (sortedJobs.length === 0) {
        jobListEl.innerHTML = '<p style="text-align:center; color:#8E8E93; margin-top:20px;">ยังไม่มีรายการใบงาน</p>';
        return;
    }

    sortedJobs.forEach(job => {
        const isPending = job.status === 'กำลังดำเนินการ';
        
        const card = document.createElement('div');
        card.className = 'job-card';
        
        card.innerHTML = `
            <div class="job-header">
                <span class="job-id">${job.id}</span>
                <span class="job-type">${job.type}</span>
            </div>
            <div class="job-date">📅 ${job.date}</div>
            <div class="status-badge ${isPending ? 'status-pending' : 'status-completed'}">
                ${isPending ? '⏳ กำลังดำเนินการ' : '✅ ปิดงานแล้ว'}
            </div>
            ${isPending ? `<button class="btn-finish" onclick="completeJob('${job.id}')">✅ ปิดงาน</button>` : ''}
        `;
        
        jobListEl.appendChild(card);
    });
}

// ฟังก์ชันเปิด-ปิด Modal
btnOpenModal.addEventListener('click', () => {
    modal.classList.remove('hidden');
});

btnCloseModal.addEventListener('click', () => {
    modal.classList.add('hidden');
});

// บันทึกใบงานใหม่
btnSaveJob.addEventListener('click', () => {
    const type = jobTypeInput.value;
    
    // สร้างเลขใบงานอัตโนมัติ (ตัวอย่าง: JOB-1234)
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newId = `JOB-${randomNum}`;
    
    // สร้างวันที่อัตโนมัติ (รูปแบบไทย)
    const today = new Date();
    const dateStr = today.toLocaleDateString('th-TH', { 
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const newJob = {
        id: newId,
        type: type,
        date: dateStr,
        status: 'กำลังดำเนินการ'
    };

    // อัปเดตข้อมูลและ LocalStorage
    jobs.push(newJob);
    saveData();
    
    // รีเฟรชหน้าจอ และปิด Modal
    renderDashboard();
    renderJobs();
    modal.classList.add('hidden');
    
    // รีเซ็ตค่าเริ่มต้น
    jobTypeInput.value = 'S-D'; 
});

// ฟังก์ชันปิดงาน (กดจากปุ่มสีเขียว)
window.completeJob = function(jobId) {
    // หาตำแหน่งของใบงาน
    const jobIndex = jobs.findIndex(job => job.id === jobId);
    
    if (jobIndex > -1) {
        // เปลี่ยนสถานะ
        jobs[jobIndex].status = 'เสร็จ';
        
        // บันทึกและรีเฟรช
        saveData();
        renderDashboard();
        renderJobs();
    }
};

// บันทึกข้อมูลลง LocalStorage
function saveData() {
    localStorage.setItem('maintenanceJobs', JSON.stringify(jobs));
}

// เรียกใช้ตอนโหลดหน้าเว็บ
init();