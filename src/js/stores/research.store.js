import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useResearchStore = defineStore('research', () => {
  const activeResearch = ref(null);
  const history = ref([]);
  const isLoading = ref(false);
  const error = ref(null);

  const canStartNew = computed(() => 
    !activeResearch.value || ['completed', 'error', 'cancelled'].includes(activeResearch.value.status)
  );

  const successRate = computed(() => {
    const completed = history.value.filter(h => h.status === 'completed');
    return history.value.length > 0 ? (completed.length / history.value.length * 100).toFixed(1) : 0;
  });

  const avgScore = computed(() => {
    const scored = history.value.filter(h => h.result?.overallScore);
    if (scored.length === 0) return 0;
    return (scored.reduce((sum, h) => sum + h.result.overallScore, 0) / scored.length).toFixed(1);
  });

  async function startResearch(params) {
    if (!canStartNew.value) {
      error.value = 'A research job is already running';
      return null;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const response = await fetch('/api/v1/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!data.success) throw new Error(data.error);

      activeResearch.value = {
        id: data.data.jobId,
        status: 'queued',
        query: params.query,
        startedAt: new Date(),
      };

      return data.data.jobId;
    } catch (err) {
      error.value = err.message;
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  function updateJobStatus(jobId, status) {
    if (activeResearch.value?.id === jobId) {
      activeResearch.value.status = status.status;
      if (status.result) {
        activeResearch.value.result = status.result;
        history.value.unshift({ ...activeResearch.value });
        activeResearch.value = null;
      }
    }
  }

  function clearError() {
    error.value = null;
  }

  return {
    activeResearch,
    history,
    isLoading,
    error,
    canStartNew,
    successRate,
    avgScore,
    startResearch,
    updateJobStatus,
    clearError,
  };
});
