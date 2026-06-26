let jobs = JSON.parse(localStorage.getItem('maintenanceJobs')) || [];

const jobListEl = document.getElementById('job-list');
const countTotalEl = document.getElementById('count-total');
const countPendingEl = document.getElementById('count-pending');
const countCompletedEl = document.getElementById('count-completed');

const modal = document.getElementById('modal');
const btnOpenModal = document.getElementById('btn-open-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const btnSaveJob = document.getElementById('btn-save-job');
const jobTypeInput = document.getElementById('job-type');

function init() {
    renderDashboard();
    renderJobs();
}

function renderDashboard() {
    const total = jobs.length;
    const completed = jobs.filter(job => job.status === 'เสร็จ').length;
    const pending = total - completed;

    countTotalEl.textContent = total;
    countPendingEl.textContent = pending;
    countCompletedEl.textContent = completed;
}

function renderJobs() {
    jobListEl.innerHTML = ''; 
    const sortedJobs = [...jobs].reverse();

    if (sortedJobs.length === 0) {
        jobListEl.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; color: var(--text-gray);">
                <div style="font-size:3rem; margin-bottom:10px;">📭</div>
                <p>ยังไม่มีรายการแจ้งซ่อมในขณะนี้</p>
            </div>`;
        return;
    }

    sortedJobs.forEach(job => {
        const isPending = job.status === 'กำลังดำเนินการ';
        const card = document.createElement('div');
        card.className = 'job-card';
        
        // อัปเดต HTML ของการ์ดให้เป็นสไตล์ใหม่
        card.innerHTML = `
            <div class="job-header-row">
                <span class="job-id">${job.id}</span>
                <span class="badge ${isPending ? 'badge-pending' : 'badge-completed'}">
                    ${isPending ? '⏳ รอดำเนินการ' : '✅ เสร็จสิ้น'}
                </span>
            </div>
            <div class="badge badge-type">ประเภท: ${job.type}</div>
            <div class="job-date">📅 อัปเดตเมื่อ: ${job.date}</div>
            
            ${isPending ? `<button class="btn-finish" onclick="completeJob('${job.id}')">ทำเครื่องหมายว่าเสร็จสิ้น</button>` : ''}
        `;
        jobListEl.appendChild(card);
    });
}

// เปิด-ปิด Modal สไตล์ Bottom Sheet
btnOpenModal.addEventListener('click', () => modal.classList.remove('hidden'));
btnCloseModal.addEventListener('click', () => modal.classList.add('hidden'));
modalBackdrop.addEventListener('click', () => modal.classList.add('hidden')); // กดพื้นหลังเพื่อปิด

btnSaveJob.addEventListener('click', () => {
    const type = jobTypeInput.value;
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newId = `JOB-${randomNum}`;
    
    const today = new Date();
    const dateStr = today.toLocaleDateString('th-TH', { 
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    jobs.push({
        id: newId,
        type: type,
        date: dateStr,
        status: 'กำลังดำเนินการ'
    });

    saveData();
    renderDashboard();
    renderJobs();
    modal.classList.add('hidden');
    jobTypeInput.value = 'S-D'; 
});

window.completeJob = function(jobId) {
    const jobIndex = jobs.findIndex(job => job.id === jobId);
    if (jobIndex > -1) {
        jobs[jobIndex].status = 'เสร็จ';
        saveData();
        renderDashboard();
        renderJobs();
    }
};

function saveData() {
    localStorage.setItem('maintenanceJobs', JSON.stringify(jobs));
}

init();