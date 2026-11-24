import type { PolicyDoc } from "./types";

// Policy for staff. Merged from "Greenfield School Policies (Staff Section) vetted by Proprietress", the Procedures
// Act (2016), "Procedure Act (How & Why)" and the "Staff Agreement Checklist", with the conflicts between them
// settled by management on 22 Nov 2026 (see .claude/skills/school-policies/SKILL.md).
export const staffPolicy: PolicyDoc = {
  key: "staff",
  title: "Staff Policy",
  readers: "Every member of staff at Greenfield School",
  version: "2026/27 draft 1",
  approvedBy: null,
  approvedOn: null,
  reviewBy: "2027-08-31",
  parts: [
    {
      id: "about",
      title: "About this policy",
      sections: [
        {
          id: "about-policy",
          title: "Who this policy is for",
          blocks: [
            {
              kind: "list",
              items: [
                "This policy applies to every member of staff. Breaking any part of it may lead to the corrective measures in this policy.",
                "Only the school management can change it. When it changes, every member of staff reads and accepts the new version.",
                "If something is not covered here, get written approval from the school management before doing it. It is then added at the next review.",
                "The policy for parents and learners also applies to how staff work with families."
              ]
            }
          ]
        }
      ]
    },
    {
      id: "joining",
      title: "Joining the school",
      sections: [
        {
          id: "joining-documents",
          title: "Documents for every new member of staff",
          blocks: [
            {
              kind: "steps",
              items: [
                "CV",
                "Professional certificates",
                "Background check form and references",
                "Schedule of duties",
                "Employment contract",
                "Appointment letter",
                "Signed acceptance of this staff policy"
              ]
            }
          ]
        },
        {
          id: "probation",
          title: "Probation",
          blocks: [
            {
              kind: "text",
              text: "New staff start with a three-month probation. The school may extend it to six months, depending on the performance rating."
            }
          ]
        },
        {
          id: "acceptance",
          title: "Accepting this policy",
          blocks: [
            {
              kind: "text",
              text: "Every member of staff confirms that they understand this policy and will follow it. The acceptance is signed by the member of staff and by the admin office."
            }
          ]
        }
      ]
    },
    {
      id: "hours",
      title: "Working hours and meetings",
      sections: [
        {
          id: "hours",
          title: "Starting and closing times",
          blocks: [
            { kind: "text", text: "All staff resume on or before 7:15 am, Monday to Friday." },
            {
              kind: "table",
              head: ["Staff", "Close Monday to Thursday", "Close Friday"],
              rows: [
                ["Teaching staff", "3:30 pm", "1:30 pm"],
                ["Staff on duty", "4:00 pm", "2:00 pm"],
                ["Admin staff", "5:00 pm", "3:00 pm"]
              ]
            }
          ]
        },
        {
          id: "meetings",
          title: "Staff meetings",
          blocks: [
            {
              kind: "table",
              head: ["Meeting", "When", "Who and what"],
              rows: [
                [
                  "Workshop",
                  "Monday and Friday, 7:15 – 7:45 am",
                  "All staff except those on duty. What happened in the week and why, and the plans for the coming weeks from the academic and welfare teams. The meeting is recorded."
                ],
                [
                  "Academic and welfare committee",
                  "Tuesday and Thursday, 7:15 – 7:45 am",
                  "Committee officials. Day-to-day work, reviews and committee reports. Minutes are kept, and committee reports are handed in twice a month."
                ]
              ],
              note: "The heads of welfare and academics each send a weekly report to the upper management."
            }
          ]
        }
      ]
    },
    {
      id: "day",
      title: "The school day",
      sections: [
        {
          id: "early-morning-activity",
          title: "Early morning activity",
          blocks: [
            {
              kind: "text",
              text: "Learners do an early morning activity from 7:15 to 7:45 am. Teachers set it on the agreed rota, at the end of the day before or early in the morning, so learners can start as soon as they arrive. Learners' completion counts towards their performance rating."
            }
          ]
        },
        {
          id: "assembly",
          title: "Assembly",
          blocks: [
            {
              kind: "table",
              head: ["Time", "What happens"],
              rows: [
                ["7:45 – 7:52", "Morning prayer, in Muslim and Christian groups (except staff on duty)"],
                ["7:52 – 7:55", "Anthems"],
                ["7:55 – 8:00", "Announcements and a five-minute educational message. The assigned teacher passes on what was agreed at the staff meeting."],
                ["8:00 – 8:03", "Closing, by the assembly prefect or learner representative"],
                ["8:03 – 8:05", "Learners march to their classes"],
                ["8:05 – 8:15", "Teachers prepare for the first lesson"]
              ],
              note: "Primary and secondary hold assembly in separate places chosen by the management."
            }
          ]
        },
        {
          id: "lesson-times",
          title: "Lesson and break times",
          blocks: [
            {
              kind: "table",
              head: ["Section", "Lessons", "Break", "After school"],
              rows: [
                ["Pre-school", "8:15 am – 2:00 pm", "—", "After-school care 2:00 – 3:00 pm"],
                ["Primary", "8:15 am – 3:00 pm", "10:15 – 10:45 am", "Set up for extra lessons 3:00 – 3:10, extra lessons 3:10 – 4:00 pm"],
                ["Secondary", "8:15 am – 3:00 pm", "11:15 – 11:45 am", "Set up for extra lessons 3:00 – 3:10, extra lessons 3:10 – 4:00 pm"]
              ],
              note: "Monday to Friday, except public holidays on the school calendar. On Fridays every section closes at 1:00 pm."
            }
          ]
        }
      ]
    },
    {
      id: "teaching",
      title: "Teaching",
      sections: [
        {
          id: "lesson-plan",
          title: "How a lesson is spent",
          blocks: [
            {
              kind: "table",
              head: ["Part", "Minutes"],
              rows: [
                ["Settle the class", "5"],
                ["Review past work or introduce the new topic", "10"],
                ["The main topic", "30"],
                ["Conclusion", "5"],
                ["Assignment or continuous assessment", "10"]
              ]
            }
          ]
        },
        {
          id: "classroom",
          title: "The classroom",
          blocks: [
            {
              kind: "list",
              items: [
                "Seat learners in alphabetical order of their names or by height.",
                "Display the class name sign and educational charts for the subjects taught.",
                "Display learners' grades in the classroom (gold, silver, bronze).",
                "Speak to learners with a good tone and manner, in British English, and make sure every learner follows the lesson.",
                "Keep a good posture in class, and keep the class quiet and working."
              ]
            }
          ]
        },
        {
          id: "subject-categories",
          title: "Subject categories",
          blocks: [
            {
              kind: "text",
              text: "Teaching staff are organised by these subject categories."
            },
            {
              kind: "table",
              head: ["Category", "Subjects"],
              rows: [
                ["A1", "Mathematics, Further Mathematics, Computer Studies"],
                ["A2", "Physics, Technical Drawing, Basic Technology"],
                ["B1", "English, Literature in English, History"],
                ["B2", "Government, Civic Education, History"],
                ["C1", "Biology, Agricultural Science"],
                ["C2", "Chemistry, Basic Science"],
                ["D1", "Financial Accounting, Business Studies"],
                ["D2", "Economics, Commerce"],
                ["E", "Geography, Physical and Health Education"]
              ]
            }
          ]
        }
      ]
    },
    {
      id: "assessment",
      title: "Assessment and examinations",
      sections: [
        {
          id: "continuous-assessment",
          title: "Continuous assessment",
          blocks: [
            {
              kind: "text",
              text: "Learners are assessed through subject notes, class participation, weekly tests and the final examination, and on their welfare (punctuality, social conduct and health)."
            }
          ]
        },
        {
          id: "exam-questions",
          title: "Examination questions",
          blocks: [
            {
              kind: "list",
              items: [
                "Set your examination questions on the staff dashboard (Exams > Tests) and send them for approval by Friday of week 2 of the term. Questions handed in late lose the holiday salary payment.",
                "The admins approve them or send them back with comments, and you are emailed either way. Make any corrections asked for and send them again. A test can only be opened to learners once it is approved.",
                "Questions are 20% from past work and 80% from this term's syllabus. Never repeat questions from an earlier examination."
              ]
            },
            {
              kind: "table",
              head: ["Section", "Examination format"],
              rows: [
                ["Crèche", "Practical examination (letters, colours and similar)"],
                ["Primary", "30 objective questions and 5 theory questions"],
                ["Secondary", "50 or more objective questions, and 3 of 5 theory questions"]
              ]
            }
          ]
        }
      ]
    },
    {
      id: "communication",
      title: "Communication",
      sections: [
        {
          id: "with-colleagues",
          title: "With colleagues",
          blocks: [
            {
              kind: "list",
              items: [
                "Keep good, friendly relations with every colleague.",
                "Staff are reached through the school secretary and at workshops. Keep your contact details up to date.",
                "Use WhatsApp or the email the management has approved, for school business only.",
                "Conversations between staff outside school follow the school's code of conduct.",
                "Reports, timetables, rotas, awards, the person of the week, adverts and urgent notices go on the notice boards."
              ]
            }
          ]
        },
        {
          id: "with-pupils",
          title: "With learners",
          blocks: [
            {
              kind: "list",
              items: [
                "Contact learners outside class only through the admin office, using the portal, email, text messages, phone calls or WhatsApp groups approved by the management.",
                "Share school news with learners at assembly."
              ]
            }
          ]
        },
        {
          id: "with-parents",
          title: "With parents",
          blocks: [
            {
              kind: "list",
              items: [
                "Year coordinators write each learner's progress in the communication book every day. Parents sign it and send it back. Welfare heads check the books every week.",
                "The PTA meets once a term at the school. Tell parents the date at least two months before. Parents who attend earn reward points.",
                "Speak to parents face to face in line with this policy."
              ]
            },
            {
              kind: "table",
              head: ["Before every event", "Send"],
              rows: [
                ["2 months", "The date, on every platform"],
                ["1 month", "A reminder"],
                ["1 week", "A reminder"],
                ["2 days", "A final reminder"]
              ]
            }
          ]
        }
      ]
    },
    {
      id: "conduct",
      title: "Conduct and corrective measures",
      sections: [
        {
          id: "dress-code",
          title: "Dress code",
          blocks: [
            {
              kind: "table",
              head: ["Day", "Men", "Women"],
              rows: [
                ["Monday, Tuesday, Thursday", "Shirt, trousers, socks, shoes and tie", "Shirt, skirt and shoes"],
                ["Wednesday", "School sports shirt", "School sports shirt"],
                ["Friday", "Native wear", "Native wear"]
              ],
              note: "Clothes and hair are always neat and decent. You may mix the school colours, green and yellow, with white or black."
            }
          ]
        },
        {
          id: "conduct",
          title: "Conduct",
          blocks: [
            {
              kind: "list",
              items: [
                "Be on time to every official duty.",
                "Behave well wherever you are posted.",
                "If someone causes trouble, send them to the right person (the welfare head or the guidance and counselling manager). If they carry on, do not argue: record what happens, or ask the school's event recorder to.",
                "Not answering a senior colleague's call in time without a good reason, or refusing to take part in an official activity, is indiscipline."
              ]
            }
          ]
        },
        {
          id: "corrective-measures",
          title: "Corrective measures for staff",
          blocks: [
            {
              kind: "table",
              head: ["What happened", "Penalty"],
              rows: [
                ["Learners making noise while the teacher is in class", "₦300"],
                ["Not in class when a lesson is due", "₦300"],
                ["Eating during working hours (outside break)", "₦400"],
                ["Leaving before closing time (the teacher and the gate officer)", "₦500"],
                ["Not obeying a senior officer", "₦500"],
                ["Too familiar with a learner", "₦500"],
                ["Poor posture in class", "₦200"],
                ["Neglecting an official duty", "₦300"],
                ["Doing a job you were not given", "₦300"],
                ["Doing something other than your official work", "₦300"],
                ["Absent without the right documents", "2 days' pay"]
              ]
            }
          ]
        },
        {
          id: "pupil-discipline",
          title: "Correcting learners",
          blocks: [
            {
              kind: "text",
              text: "Correct learners using the steps in the policy for parents and learners (When a rule is broken): count how many times the learner has broken the same rule and use the matching correction. Record every case on the Discipline page."
            }
          ]
        },
        {
          id: "school-pass",
          title: "Time off (school pass)",
          blocks: [
            {
              kind: "list",
              items: [
                "Give the management at least one month's notice before the day you need.",
                "In an emergency, such as illness, tell the management straight away, and attach a doctor's report or another document with your pass letter."
              ]
            }
          ]
        }
      ]
    },
    {
      id: "safeguarding-data",
      title: "Safeguarding, personal data and devices",
      sections: [
        {
          id: "staff-safeguarding",
          title: "Keeping children safe",
          blocks: [
            {
              kind: "text",
              text: "Every member of staff is responsible for the safety of every child. The school follows the Child's Rights Law of Lagos State. The Head Teacher is the safeguarding lead, unless the Proprietress names someone else."
            },
            {
              kind: "steps",
              items: [
                "If a child tells you something worrying, or you notice signs of harm, listen calmly and don't ask leading questions.",
                "Never promise to keep it secret. Tell the child you will pass it on to get help.",
                "Write down what you saw or heard, in the child's words, with the date and time, and sign it.",
                "Give it to the safeguarding lead the same day. If the worry is about the safeguarding lead, go to the Proprietress.",
                "Don't investigate yourself or discuss it with anyone else. The safeguarding lead decides what happens next, including telling the parents or the authorities."
              ]
            },
            {
              kind: "list",
              items: [
                "Never use corporal punishment, or harm, threaten or humiliate a child. Correct learners only as set out in \"When a rule is broken\".",
                "Avoid being alone with a learner behind a closed door. Keep the door open or another adult nearby.",
                "Don't take a learner in your own car, or meet a learner outside school, without written permission from the parent and the Head Teacher.",
                "Don't contact learners or parents on your personal phone or social media. Use the portal or the school's approved channels (see \"With learners\").",
                "Report any colleague whose behaviour towards a child worries you to the safeguarding lead. You will be protected for reporting in good faith."
              ]
            }
          ]
        },
        {
          id: "staff-data",
          title: "Personal information",
          blocks: [
            {
              kind: "text",
              text: "The school follows the Nigeria Data Protection Act 2023. Learners', parents' and colleagues' information is used only for school work."
            },
            {
              kind: "list",
              items: [
                "Look only at the records you need for your work. Changes you make on the staff dashboard are recorded with your name.",
                "Never share your password, and lock or sign out of the computer when you leave it.",
                "Don't copy learner lists, results, health notes or contact details to your own phone, computer, email or WhatsApp.",
                "Take photos and videos of learners only on school devices, and only of learners whose parents have agreed. Delete them from any personal device.",
                "Don't discuss a learner or family with anyone outside the school, or with colleagues who don't need to know.",
                "If information is lost or sent to the wrong person, tell the administrator straight away. The school must tell the Nigeria Data Protection Commission within 72 hours when the law requires it."
              ]
            }
          ]
        },
        {
          id: "staff-devices",
          title: "Phones, the portal and online classes",
          blocks: [
            {
              kind: "list",
              items: [
                "Keep your personal phone away during lessons, assembly and duties, except for school work or an emergency.",
                "Reply to parents' messages on the portal within two school days, politely and in plain words. Pass anything about a child's safety to the safeguarding lead, and anything about fees to the office.",
                "The front desk and admins answer parents' messages to the school office within two school days. Reply as the school office: say who you are, and pass a question to the right colleague rather than guessing.",
                "Run online classes from a quiet, suitable place, dressed as for school. Don't record a class unless the Head Teacher approves it and parents are told.",
                "Report messages from parents or learners that are abusive or worrying to the Head Teacher, rather than replying."
              ]
            }
          ]
        }
      ]
    },
    {
      id: "pay",
      title: "Pay, rewards and performance",
      sections: [
        {
          id: "salaries",
          title: "Salaries and recognition",
          blocks: [
            {
              kind: "list",
              items: [
                "Salaries are paid on the last working day of every month.",
                "The school honours its staff at the Teachers' Shower, and recognises outstanding staff at the end of every session."
              ]
            }
          ]
        },
        {
          id: "performance-rating",
          title: "Performance rating",
          blocks: [
            {
              kind: "text",
              text: "Staff are rated on how well they handle academic and welfare work, and on their drive towards the school's success."
            }
          ]
        },
        {
          id: "staff-points",
          title: "Reward points for staff",
          blocks: [
            {
              kind: "table",
              head: ["You earn", "Points"],
              rows: [
                ["Each new learner admitted with your reference number", "200"],
                ["Each evaluation report of 80% or more", "100"]
              ]
            },
            {
              kind: "table",
              head: ["Points", "Reward"],
              rows: [
                ["1,000", "5% salary increase"],
                ["5,000", "Promotion"]
              ]
            }
          ]
        }
      ]
    },
    {
      id: "duties",
      title: "Who does what",
      sections: [
        {
          id: "management",
          title: "School management",
          blocks: [
            {
              kind: "list",
              items: [
                "Makes policy and plans.",
                "Develops the curriculum.",
                "Supports learners' development.",
                "Runs the school's administration, staff and communications.",
                "Markets the school through how well it runs and how well its people behave, to existing families, neighbouring communities and partner schools."
              ]
            }
          ]
        },
        {
          id: "administrator",
          title: "Administrator",
          blocks: [
            {
              kind: "list",
              items: [
                "Keeps staff and learner records accurate, confidential and easy to find.",
                "Runs learner registration and admissions.",
                "Receives and acts on letters from inside and outside the school.",
                "Records money and resources coming in and going out, and issues running funds and receipts."
              ]
            }
          ]
        },
        {
          id: "welfare-head",
          title: "Welfare head",
          blocks: [
            {
              kind: "list",
              items: [
                "Leads welfare and keeps management, staff, learners and parents informed on welfare matters.",
                "Watches learners' health, attendance and punctuality, and acts when needed.",
                "Leads discipline with the year coordinators: behaviour, punctuality, uniform, attendance and the tone of the school.",
                "Oversees staff recruitment and duties, and sends the daily cover rota and notices.",
                "Runs the learners' leadership programme.",
                "Looks after equipment for school activities, and keeps the school safe and good for learning.",
                "Meets learner and staff coordinators regularly, and helps market the school."
              ]
            }
          ]
        },
        {
          id: "academics-head",
          title: "Academics head",
          blocks: [
            {
              kind: "list",
              items: [
                "Leads academics and keeps management, staff, learners and parents informed on academic matters.",
                "Sets the curriculum aims for each year group and subject, reviews subjects, and makes sure Ministry of Education requirements are met.",
                "Makes sure the timetable works and everyone can see it.",
                "Leads the studies coordinators and chairs their meetings.",
                "Makes sure assessments are realistic, fair and reliable, and sets the assessment calendar, examination timetables and invigilation rotas.",
                "Makes sure there is help for learners who are behind, especially in English and Mathematics, and builds on each learner's strongest subjects.",
                "Prepares learners for competitions, and works with the welfare team on discipline in class."
              ]
            }
          ]
        }
      ]
    },
    {
      id: "operations",
      title: "Admissions, inventory and events",
      sections: [
        {
          id: "admissions-steps",
          title: "Admissions",
          blocks: [
            {
              kind: "steps",
              items: [
                "The front desk asks the family to fill in the enquiry form.",
                "From the form and a conversation, the family is given the next available entrance examination appointment.",
                "From the enquiry form, the learner is placed in a fee grade (see Scholarship grades in the policy for parents and learners).",
                "Collect every admission document, and have the parent, the learner and the admin office sign the Terms and Agreements."
              ]
            }
          ]
        },
        {
          id: "inventory",
          title: "Inventory",
          blocks: [
            {
              kind: "text",
              text: "Count the school inventory twice every term. The accountant or admin officer signs the inventory record and files it."
            }
          ]
        },
        {
          id: "events",
          title: "Running an event",
          blocks: [
            {
              kind: "steps",
              items: [
                "Prepare the site: seating, decoration and adverts.",
                "Arrange refreshments.",
                "Arrange entertainment and learning: drama, dance and similar.",
                "Afterwards, put everything back where it was."
              ]
            },
            {
              kind: "text",
              text: "The management organises every event, and the PTA is invited to contribute. School events include the workshop and committee meetings, PTA meetings, open day, Teachers' Day, the end of year and end of session parties and inter-house sports. Learners also take part in competitions with other schools, such as spelling bees, the Cowbell mathematics competition and science olympiads."
            }
          ]
        }
      ]
    }
  ]
};
