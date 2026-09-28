// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAx5rbrddaDnPt2x93VFMf1gxc60yy5FtI",
  authDomain: "yazidsplitbill.firebaseapp.com",
  projectId: "yazidsplitbill",
  storageBucket: "yazidsplitbill.firebasestorage.app",
  messagingSenderId: "249936725882",
  appId: "1:249936725882:web:91250897eefed77f21f8c3",
  measurementId: "G-1JEGB0CQ9D"
};

// Initialize Firebase (Using Compat syntax for local file:// execution)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Form & Calculation
    const form = document.getElementById('splitBillForm');
    const eventNameInput = document.getElementById('eventName');
    const totalAmountInput = document.getElementById('totalAmount');
    const numPeopleInput = document.getElementById('numPeople');
    const btnMinusPerson = document.getElementById('btnMinusPerson');
    const btnPlusPerson = document.getElementById('btnPlusPerson');
    const tipBtns = document.querySelectorAll('.tip-btn');
    const resultSection = document.getElementById('resultSection');
    const btnReset = document.getElementById('btnReset');
    const calculateBtn = document.getElementById('calculateBtn');
    
    // Result displays
    const perPersonAmountDisplay = document.getElementById('perPersonAmount');
    const summaryBaseBillDisplay = document.getElementById('summaryBaseBill');
    const summaryTipDisplay = document.getElementById('summaryTip');
    const summaryTotalDisplay = document.getElementById('summaryTotal');

    // DB & Recap Elements
    const btnSaveToDB = document.getElementById('btnSaveToDB');
    const filterMonthYear = document.getElementById('filterMonthYear');
    const recapList = document.getElementById('recapList');
    const emptyState = document.getElementById('emptyState');
    const recapSummaryCard = document.getElementById('recapSummaryCard');
    const totalRecapAmountDisplay = document.getElementById('totalRecapAmount');
    
    // Auth Elements
    const btnLogin = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');
    const loggedOutView = document.getElementById('loggedOutView');
    const loggedInView = document.getElementById('loggedInView');
    const userNameDisplay = document.getElementById('userName');
    const userPhotoDisplay = document.getElementById('userPhoto');

    // Toast Notification
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    // State
    let currentTipPercentage = 0;
    let currentCalculation = null;
    let currentUser = null;
    let unsubscribeSnapshot = null;
    let cloudRecords = [];

    // --- UTILITIES ---

    const formatRupiah = (number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(number);
    };

    const showToast = (msg, isError = false) => {
        toastMessage.textContent = msg;
        
        if (isError) {
            toast.classList.replace('border-brand-300', 'border-red-500');
            toast.querySelector('.bg-brand-300\\/20')?.classList.replace('bg-brand-300/20', 'bg-red-100');
            toast.querySelector('.text-brand-300')?.classList.replace('text-brand-300', 'text-red-500');
            toast.querySelector('i').className = 'fa-solid fa-triangle-exclamation';
        } else {
            toast.classList.replace('border-red-500', 'border-brand-300');
            toast.querySelector('.bg-red-100')?.classList.replace('bg-red-100', 'bg-brand-300/20');
            toast.querySelector('.text-red-500')?.classList.replace('text-red-500', 'text-brand-300');
            toast.querySelector('i').className = 'fa-solid fa-check';
        }

        toast.classList.remove('translate-y-20', 'opacity-0');
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
        }, 3000);
    };

    // --- AUTHENTICATION ---

    btnLogin.addEventListener('click', async () => {
        try {
            await auth.signInWithPopup(provider);
            showToast('Berhasil Login!');
        } catch (error) {
            console.error(error);
            showToast('Gagal Login', true);
        }
    });

    btnLogout.addEventListener('click', async () => {
        await auth.signOut();
        showToast('Berhasil Logout');
    });

    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            loggedOutView.classList.add('hidden');
            loggedInView.classList.remove('hidden');
            userNameDisplay.textContent = user.displayName.split(' ')[0]; // First name
            userPhotoDisplay.src = user.photoURL;
            
            // Listen to real-time database when logged in
            listenToDatabase();
        } else {
            currentUser = null;
            loggedOutView.classList.remove('hidden');
            loggedInView.classList.add('hidden');
            
            // Stop listening to DB and clear local data
            if (unsubscribeSnapshot) unsubscribeSnapshot();
            cloudRecords = [];
            updateFilterOptions();
            renderRecap();
        }
    });


    // --- CLOUD DATABASE (FIRESTORE) ---

    const listenToDatabase = () => {
        // Filter query to ONLY fetch data belonging to the current user
        const q = db.collection('recap_splitbill').where('userId', '==', currentUser.uid);
        
        unsubscribeSnapshot = q.onSnapshot((snapshot) => {
            cloudRecords = [];
            snapshot.forEach((doc) => {
                cloudRecords.push({ id: doc.id, ...doc.data() });
            });
            
            // Sort locally to avoid needing a Firestore Composite Index
            cloudRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            updateFilterOptions();
            renderRecap();
        }, (error) => {
            console.error("Error fetching data:", error);
            showToast("Gagal mengambil data", true);
        });
    };

    btnSaveToDB.addEventListener('click', async () => {
        if (!currentCalculation) return;
        
        if (!currentUser) {
            showToast('Harap Login terlebih dahulu!', true);
            return;
        }

        const now = new Date();
        const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const record = {
            date: now.toISOString(),
            monthYear: monthYear,
            userName: currentUser.displayName,
            userEmail: currentUser.email,
            userId: currentUser.uid,
            ...currentCalculation
        };

        try {
            // Save to Firestore Cloud
            btnSaveToDB.disabled = true;
            btnSaveToDB.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
            
            await db.collection('recap_splitbill').add(record);
            
            showToast('Data berhasil disimpan ke Cloud!');
            filterMonthYear.value = monthYear; // Auto select current month
            
        } catch (error) {
            console.error(error);
            showToast('Gagal menyimpan data!', true);
        } finally {
            btnSaveToDB.disabled = false;
            btnSaveToDB.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Simpan ke Cloud Database';
        }
    });

    const deleteFromCloud = async (id) => {
        try {
            await db.collection('recap_splitbill').doc(id).delete();
            showToast('Data berhasil dihapus!');
        } catch (error) {
            console.error(error);
            showToast('Gagal menghapus data!', true);
        }
    };

    // --- FORM LOGIC ---

    // Handle Number of People controls
    btnMinusPerson.addEventListener('click', () => {
        let currentValue = parseInt(numPeopleInput.value) || 2;
        if (currentValue > 1) {
            numPeopleInput.value = currentValue - 1;
        }
    });

    btnPlusPerson.addEventListener('click', () => {
        let currentValue = parseInt(numPeopleInput.value) || 1;
        numPeopleInput.value = currentValue + 1;
    });

    numPeopleInput.addEventListener('blur', () => {
        let val = parseInt(numPeopleInput.value);
        if (isNaN(val) || val < 1) numPeopleInput.value = 1;
    });

    // Handle Tip Selection
    tipBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tipBtns.forEach(b => b.classList.remove('active-tip'));
            btn.classList.add('active-tip');
            currentTipPercentage = parseFloat(btn.dataset.tip);
        });
    });

    // Handle Form Submission
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const eventName = eventNameInput.value.trim();
        const baseAmount = parseFloat(totalAmountInput.value);
        const numPeople = parseInt(numPeopleInput.value);

        if (isNaN(baseAmount) || baseAmount <= 0) return;

        // Calculations
        const tipAmount = baseAmount * (currentTipPercentage / 100);
        const totalAmount = baseAmount + tipAmount;
        const perPersonAmount = totalAmount / numPeople;

        // Save current calculation state
        currentCalculation = {
            eventName,
            baseAmount,
            tipAmount,
            tipPercentage: currentTipPercentage,
            totalAmount,
            numPeople,
            perPersonAmount
        };

        // Update UI
        perPersonAmountDisplay.textContent = formatRupiah(perPersonAmount);
        summaryBaseBillDisplay.textContent = formatRupiah(baseAmount);
        summaryTipDisplay.textContent = `${formatRupiah(tipAmount)} (${currentTipPercentage}%)`;
        summaryTotalDisplay.textContent = formatRupiah(totalAmount);

        calculateBtn.style.display = 'none';
        resultSection.classList.remove('hidden');
        resultSection.classList.add('block');
    });

    // Handle Reset
    btnReset.addEventListener('click', () => {
        form.reset();
        tipBtns.forEach(b => b.classList.remove('active-tip'));
        tipBtns[0].classList.add('active-tip');
        currentTipPercentage = 0;
        currentCalculation = null;
        
        resultSection.classList.add('hidden');
        resultSection.classList.remove('block');
        calculateBtn.style.display = 'block';
        totalAmountInput.focus();
    });


    // --- RECAP LOGIC ---

    const getMonthsList = () => {
        const months = new Set();
        
        const now = new Date();
        months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        
        cloudRecords.forEach(r => months.add(r.monthYear));
        return Array.from(months).sort((a, b) => b.localeCompare(a));
    };

    const updateFilterOptions = () => {
        const months = getMonthsList();
        const currentValue = filterMonthYear.value;
        
        filterMonthYear.innerHTML = '';
        
        months.forEach(my => {
            const [year, month] = my.split('-');
            const dateObj = new Date(year, parseInt(month) - 1, 1);
            const label = dateObj.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
            
            const option = document.createElement('option');
            option.value = my;
            option.textContent = label;
            filterMonthYear.appendChild(option);
        });

        if (currentValue && months.includes(currentValue)) {
            filterMonthYear.value = currentValue;
        }
    };

    const renderRecap = () => {
        if (!currentUser) {
            recapList.innerHTML = '';
            emptyState.classList.remove('hidden');
            emptyState.querySelector('p').innerHTML = 'Silakan <b>Login</b> terlebih dahulu untuk melihat rekap database.';
            recapSummaryCard.classList.add('hidden');
            return;
        }

        const selectedMonth = filterMonthYear.value;
        const filteredRecords = cloudRecords.filter(r => r.monthYear === selectedMonth);
        
        recapList.innerHTML = '';
        
        if (filteredRecords.length === 0) {
            emptyState.classList.remove('hidden');
            emptyState.querySelector('p').textContent = 'Belum ada data rekap di bulan ini.';
            recapSummaryCard.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        recapSummaryCard.classList.remove('hidden');

        let totalPengeluaran = 0;

        filteredRecords.forEach(record => {
            totalPengeluaran += record.totalAmount;
            
            const dateLabel = new Date(record.date).toLocaleDateString('id-ID', { 
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
            });

            // Hanya izinkan user yang menginput data ini untuk melihat tombol hapus
            const isOwner = currentUser.uid === record.userId;

            const el = document.createElement('div');
            el.className = 'glass-card p-5 rounded-2xl border border-white/60 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row justify-between sm:items-center gap-4 group relative';
            
            el.innerHTML = `
                <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="text-xs font-bold px-2 py-1 bg-brand-900/10 text-brand-900 rounded-lg"><i class="fa-regular fa-clock"></i> ${dateLabel}</span>
                        <span class="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg flex items-center gap-1"><i class="fa-solid fa-users"></i> ${record.numPeople} org</span>
                        <span class="text-xs font-bold px-2 py-1 bg-brand-300/20 text-brand-700 rounded-lg flex items-center gap-1"><i class="fa-solid fa-user-pen"></i> ${record.userName}</span>
                    </div>
                    <div class="font-extrabold text-xl text-slate-800 mb-1 line-clamp-1">${record.eventName || 'Pengeluaran Tanpa Nama'}</div>
                    <div class="font-bold text-lg text-brand-700 mb-1">${formatRupiah(record.totalAmount)}</div>
                    <div class="text-sm font-medium text-slate-500">
                        Tagihan: ${formatRupiah(record.baseAmount)} | Tip: ${record.tipPercentage}%
                    </div>
                </div>
                <div class="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t sm:border-t-0 border-slate-200/60 pt-3 sm:pt-0">
                    <div class="text-right flex-1 sm:flex-none">
                        <div class="text-xs font-semibold text-brand-700 mb-0.5">Per Orang</div>
                        <div class="font-extrabold text-brand-500 text-lg">${formatRupiah(record.perPersonAmount)}</div>
                    </div>
                    ${isOwner ? `
                    <button class="delete-btn w-10 h-10 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors shadow-sm" data-id="${record.id}" title="Hapus Rekap">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    ` : ''}
                </div>
            `;
            
            recapList.appendChild(el);
        });

        // Attach delete events
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if(confirm('Yakin ingin menghapus data rekap ini dari Cloud?')) {
                    deleteFromCloud(id);
                }
            });
        });

        // Update Total
        totalRecapAmountDisplay.textContent = formatRupiah(totalPengeluaran);
    };

    // --- INITIALIZATION ---
    filterMonthYear.addEventListener('change', renderRecap);
    updateFilterOptions();
    renderRecap();
});
