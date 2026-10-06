-- Result sheet: 1st CA, 2nd CA, Exam (objective + theory)
--
-- The result sheet (/admin/academics/results) stores each column as an academic_assessment with one of
-- these types: first_ca, second_ca, exam_objective, exam_theory. Their max scores add up to 100, so the raw
-- scores already are the subject total. When no assessment_weight is configured for one of these types the
-- summary view now counts the raw score instead of 0. Weighted behaviour for every other type is unchanged.

create or replace view public.academic_student_subject_term_summary as
with base as (
  select
    s.id as student_id,
    a.academic_year_id,
    a.academic_term_id,
    a.class_id,
    c.level as class_level,
    a.subject_id,
    sub.name as subject_name,
    coalesce(
      sum(
        case
          when w.weight is not null then (sc.score / nullif(a.max_score, 0)) * 100 * (w.weight / 100)
          when a.assessment_type in ('first_ca', 'second_ca', 'exam_objective', 'exam_theory') then sc.score
          else 0
        end
      ),
      0
    ) as weighted_score
  from public.academic_assessment_scores sc
  join public.academic_assessments a on a.id = sc.assessment_id
  join public.students s on s.id = sc.student_id
  left join public.classes c on c.id = s.class_id
  join public.subjects sub on sub.id = a.subject_id
  left join public.assessment_weights w
    on w.active = true
   and w.level = c.level
   and w.assessment_type = a.assessment_type
  group by s.id, a.academic_year_id, a.academic_term_id, a.class_id, c.level, a.subject_id, sub.name
)
select
  b.student_id,
  b.academic_year_id,
  b.academic_term_id,
  b.class_id,
  b.class_level,
  b.subject_id,
  b.subject_name,
  b.weighted_score,
  gs.grade
from base b
left join public.grading_scales gs
  on gs.active = true
 and gs.level = b.class_level
 and b.weighted_score between gs.min_score and gs.max_score;
